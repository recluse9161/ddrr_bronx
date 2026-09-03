# -*- coding: utf-8 -*-
"""
Created on Wed Sep  2 23:22:59 2026

@author: AndrédeOliveira
"""

# =============================================================================
# INTERSECT ICEBREAKER SIGHTINGS WITH BRONX NEIGHBORHOODS
#
# This script:
# 1. Reads the icebreaker point GeoJSON.
# 2. Reads the Bronx neighborhood polygon GeoJSON.
# 3. Intersects the points with the neighborhoods.
# 4. Adds/updates an "ice_count" field in the neighborhood layer.
# 5. Adds/updates a "neighborhood" field in the icebreaker layer.
# 6. Saves both updated GeoJSON files back to their original locations.
# =============================================================================


# -----------------------------------------------------------------------------
# LOAD LIBRARIES
# -----------------------------------------------------------------------------

# Import GeoPandas for spatial vector operations.
import geopandas as gpd

# Import pandas for table operations.
import pandas as pd

# Import Path for working with file paths.
from pathlib import Path

# Import os for safely replacing the original files.
import os


# -----------------------------------------------------------------------------
# INPUT FILES
# -----------------------------------------------------------------------------

# Ice sighting point layer.
ice_file = Path(
    r"D:\Andre\Cartography\RR\ddrr_bronx\data\icebreaker.geojson"
)

# Bronx neighborhood polygon layer.
neighborhood_file = Path(
    r"D:\Andre\Cartography\RR\ddrr_bronx\data\bronx_neighborhoods.geojson"
)


# -----------------------------------------------------------------------------
# OUTPUT FIELD NAMES
# -----------------------------------------------------------------------------

# Field that will contain the number of ice sightings in each neighborhood.
count_field = "ice_count"

# Field that will contain the neighborhood name for each ice sighting.
point_neighborhood_field = "neighborhood"


# -----------------------------------------------------------------------------
# READ DATA
# -----------------------------------------------------------------------------

# Read the ice sighting points.
ice = gpd.read_file(ice_file)

# Read the Bronx neighborhood polygons.
neighborhoods = gpd.read_file(neighborhood_file)


# Print some basic information.
print("Ice sightings:")
print(f"  Features: {len(ice)}")
print(f"  CRS: {ice.crs}")

print("\nNeighborhoods:")
print(f"  Features: {len(neighborhoods)}")
print(f"  CRS: {neighborhoods.crs}")


# -----------------------------------------------------------------------------
# FIND THE NEIGHBORHOOD NAME FIELD
# -----------------------------------------------------------------------------

# Possible neighborhood-name fields commonly found in NYC neighborhood layers.
possible_name_fields = [
    "NTAName",
    "ntaname",
    "NTA_NAME",
    "nta_name",
    "name",
    "Name",
    "NAME",
    "neighborhood",
    "Neighborhood",
    "NEIGHBORHOOD"
]


# Start with no matched field.
neighborhood_name_field = None


# Loop through the possible field names.
for field in possible_name_fields:

    # Check whether the field exists in the neighborhood layer.
    if field in neighborhoods.columns:

        # Save the first matching field.
        neighborhood_name_field = field

        # Stop searching once one is found.
        break


# Stop the script if no neighborhood-name field was found.
if neighborhood_name_field is None:

    # Print all available fields to make troubleshooting easier.
    print("\nAvailable neighborhood fields:")
    print(neighborhoods.columns.tolist())

    # Raise an error explaining what needs to be changed.
    raise ValueError(
        "Could not automatically identify the neighborhood name field. "
        "Set neighborhood_name_field manually near the top of the script."
    )


# Print the field that will be used.
print(
    f"\nNeighborhood name field identified as: "
    f"{neighborhood_name_field}"
)


# -----------------------------------------------------------------------------
# CHECK GEOMETRIES
# -----------------------------------------------------------------------------

# Remove any ice sightings that have completely missing geometries.
# These cannot be spatially intersected.
ice_valid = ice[ice.geometry.notna()].copy()

# Remove any neighborhood records with completely missing geometries.
neighborhoods_valid = neighborhoods[
    neighborhoods.geometry.notna()
].copy()


# -----------------------------------------------------------------------------
# MATCH COORDINATE REFERENCE SYSTEMS
# -----------------------------------------------------------------------------

# Make sure both layers actually have a defined CRS.
if ice_valid.crs is None:
    raise ValueError("The icebreaker layer does not have a defined CRS.")

# Make sure the neighborhood layer has a defined CRS.
if neighborhoods_valid.crs is None:
    raise ValueError("The neighborhood layer does not have a defined CRS.")


# Check whether the layers use different CRSs.
if ice_valid.crs != neighborhoods_valid.crs:

    # Print a message explaining the reprojection.
    print(
        "\nCRSs differ. Reprojecting ice sightings "
        "to match the neighborhood layer."
    )

    # Reproject the ice points to the neighborhood CRS.
    ice_valid = ice_valid.to_crs(neighborhoods_valid.crs)


# -----------------------------------------------------------------------------
# CREATE A UNIQUE INTERNAL NEIGHBORHOOD ID
# -----------------------------------------------------------------------------

# Create a temporary unique ID based on each polygon's row number.
# This lets us count by polygon even if neighborhood names are duplicated.
neighborhoods_valid["_neigh_id"] = range(len(neighborhoods_valid))


# -----------------------------------------------------------------------------
# SPATIAL JOIN
# -----------------------------------------------------------------------------

# Keep only the fields needed from the neighborhood layer during the join.
neighborhood_join_fields = neighborhoods_valid[
    [
        "_neigh_id",
        neighborhood_name_field,
        "geometry"
    ]
].copy()


# Spatially join each ice point to any neighborhood polygon it intersects.
#
# "intersects" means:
# - points inside a polygon match
# - points exactly on a polygon boundary also match
joined = gpd.sjoin(
    ice_valid,
    neighborhood_join_fields,
    how="left",
    predicate="intersects"
)


# -----------------------------------------------------------------------------
# CHECK FOR POINTS MATCHING MORE THAN ONE NEIGHBORHOOD
# -----------------------------------------------------------------------------

# Count how many polygon matches each original point received.
matches_per_point = joined.groupby(joined.index).size()


# Find points that intersected more than one neighborhood.
multiple_matches = matches_per_point[matches_per_point > 1]


# Print a warning if boundary points matched multiple polygons.
if len(multiple_matches) > 0:

    print(
        f"\nWARNING: {len(multiple_matches)} ice sighting(s) intersected "
        "more than one neighborhood."
    )

    print(
        "For those points, the first matching neighborhood will be used "
        "for the neighborhood-name field."
    )


# -----------------------------------------------------------------------------
# COUNT ICE SIGHTINGS BY NEIGHBORHOOD
# -----------------------------------------------------------------------------

# Keep only joined records that actually matched a neighborhood.
matched = joined[joined["_neigh_id"].notna()].copy()


# Count the number of point records associated with each neighborhood polygon.
#
# nunique() counts unique original point indices, so a point will not be
# double-counted within the same neighborhood.
ice_counts = (
    matched
    .reset_index()
    .groupby("_neigh_id")["index"]
    .nunique()
)


# Convert the count Series to a dictionary.
ice_count_dict = ice_counts.to_dict()


# Create or overwrite the ice_count field.
#
# Neighborhoods with no sightings receive 0.
neighborhoods_valid[count_field] = (
    neighborhoods_valid["_neigh_id"]
    .map(ice_count_dict)
    .fillna(0)
    .astype(int)
)


# -----------------------------------------------------------------------------
# ADD NEIGHBORHOOD NAME TO EACH ICE SIGHTING
# -----------------------------------------------------------------------------

# If a point intersects more than one polygon, keep only its first match.
point_neighborhood_lookup = (
    joined[
        [neighborhood_name_field]
    ]
    .groupby(level=0)
    .first()
)


# Create or overwrite the neighborhood field in the original ice layer.
ice[point_neighborhood_field] = ice.index.map(
    point_neighborhood_lookup[neighborhood_name_field]
)


# -----------------------------------------------------------------------------
# TRANSFER ICE COUNTS BACK TO THE ORIGINAL NEIGHBORHOOD DATAFRAME
# -----------------------------------------------------------------------------

# Create a temporary lookup between the original neighborhood index
# and the newly calculated ice count.
count_lookup = pd.Series(
    neighborhoods_valid[count_field].values,
    index=neighborhoods_valid.index
)


# Create or overwrite the count field in the original neighborhood layer.
neighborhoods[count_field] = neighborhoods.index.map(count_lookup)


# Neighborhoods that were excluded because of missing geometry receive 0.
neighborhoods[count_field] = (
    neighborhoods[count_field]
    .fillna(0)
    .astype(int)
)


# -----------------------------------------------------------------------------
# CREATE TEMPORARY OUTPUT FILES
# -----------------------------------------------------------------------------

# Temporary icebreaker output file.
ice_temp_file = ice_file.with_name(
    ice_file.stem + "_TEMP.geojson"
)

# Temporary neighborhood output file.
neighborhood_temp_file = neighborhood_file.with_name(
    neighborhood_file.stem + "_TEMP.geojson"
)


# -----------------------------------------------------------------------------
# SAVE UPDATED ICEBREAKER LAYER
# -----------------------------------------------------------------------------

# Write the updated ice sightings to a temporary GeoJSON file.
ice.to_file(
    ice_temp_file,
    driver="GeoJSON",
    index=False
)


# -----------------------------------------------------------------------------
# SAVE UPDATED NEIGHBORHOOD LAYER
# -----------------------------------------------------------------------------

# Remove the internal temporary ID before saving.
if "_neigh_id" in neighborhoods.columns:
    neighborhoods = neighborhoods.drop(columns=["_neigh_id"])


# Write the updated neighborhood polygons to a temporary GeoJSON file.
neighborhoods.to_file(
    neighborhood_temp_file,
    driver="GeoJSON",
    index=False
)


# -----------------------------------------------------------------------------
# REPLACE ORIGINAL FILES
# -----------------------------------------------------------------------------

# Replace the original icebreaker GeoJSON with the updated temporary file.
os.replace(
    ice_temp_file,
    ice_file
)

# Replace the original neighborhood GeoJSON with the updated temporary file.
os.replace(
    neighborhood_temp_file,
    neighborhood_file
)


# -----------------------------------------------------------------------------
# RESULTS
# -----------------------------------------------------------------------------

# Count the number of ice sightings that received a neighborhood.
assigned_count = ice[point_neighborhood_field].notna().sum()

# Count sightings that did not intersect any neighborhood.
unassigned_count = ice[point_neighborhood_field].isna().sum()


# Print final results.
print("\n============================================================")
print("FINISHED")
print("============================================================")

print("\nUpdated neighborhood layer:")
print(neighborhood_file)

print(f"\nField created/updated: {count_field}")

print("\nUpdated icebreaker layer:")
print(ice_file)

print(
    f"\nField created/updated: "
    f"{point_neighborhood_field}"
)

print(f"\nIce sightings assigned to a neighborhood: {assigned_count}")

print(f"Ice sightings outside all neighborhoods: {unassigned_count}")

print(
    f"Total ice sightings counted in neighborhoods: "
    f"{neighborhoods[count_field].sum()}"
)

print("\nIce sightings by neighborhood:")

# Print neighborhoods from highest to lowest count.
print(
    neighborhoods[
        [neighborhood_name_field, count_field]
    ]
    .sort_values(
        count_field,
        ascending=False
    )
    .to_string(index=False)
)