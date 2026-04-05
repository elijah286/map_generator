import pandas as pd
import openai
import json
import os
import time
import subprocess

try:
    import matplotlib.pyplot as plt
    import cartopy.crs as ccrs
    import cartopy.feature as cfeature
except ImportError as e:
    print(f"❌ Missing required dependencies. Please install them with:")
    print("pip install cartopy matplotlib openpyxl")
    print(f"Error: {e}")
    exit(1)

# === CONFIGURATION ===
# Set OPENAI_API_KEY in the environment. Override Excel path with UNIVERSITY_EXCEL_PATH if needed.
openai.api_key = os.environ.get("OPENAI_API_KEY", "")
INPUT_FILE = os.environ.get(
    "UNIVERSITY_EXCEL_PATH",
    "Community Program Universities.xlsx",
)
CACHE_FILE = "location_cache.json"
OUTPUT_FILE = "university_map.svg"
OUTPUT_FILE_EUROPE = "university_map_europe.svg"
OUTPUT_FILE_ASIA = "university_map_asia.svg"
OUTPUT_FILE_NORTH_AMERICA = "university_map_north_america.svg"
OUTPUT_FILE_SOUTH_AMERICA = "university_map_south_america.svg"
INPUT_SHEET = "Schools --> Customers"

# === HELPER FUNCTIONS ===
def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

def ask_user(prompt):
    return input(prompt).strip().lower() in ['yes', 'y']

def gpt_geocode(location_string):
    try:
        if not location_string:
            print("⚠️ Skipped blank location string")
            return None

        print(f"🤖 Using GPT to geocode: {location_string}")
        client = openai.OpenAI(api_key=openai.api_key)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a geolocation API. Only respond with valid latitude and longitude in the format: 12.34, -56.78. Do not add any explanation or extra words."},
                {"role": "user", "content": f"What are the latitude and longitude coordinates for {location_string}?"}
            ],
            temperature=0,
        )
        response_text = response.choices[0].message.content.strip()
        print(f"🧠 GPT raw response: {response_text}")
        try:
            coords = [float(x.strip()) for x in response_text.split(',')]
            if len(coords) == 2:
                return coords[0], coords[1]
        except Exception:
            print(f"❌ GPT response not in expected format: {response_text}")
    except Exception as e:
        print(f"❌ GPT failed for {location_string}: {e}\n")
    return None

def geocode_location(location_string, cache):
    if location_string in cache:
        print(f"✅ Using cached coordinates for {location_string}")
        return cache[location_string]

    coords = gpt_geocode(location_string)
    if coords:
        cache[location_string] = coords
        save_cache(cache)
    else:
        print(f"❌ Failed to geocode: {location_string}")
    return coords

def plot_locations(data, use_size, separate_status):
    plt.figure(figsize=(18, 9))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS)
    ax.add_feature(cfeature.OCEAN, color='#f0f0f0')
    ax.add_feature(cfeature.LAND, color='#dddddd')
    ax.set_global()

    for _, row in data.iterrows():
        lat, lon = row['Latitude'], row['Longitude']
        color = 'green'
        size = row['Member Count'] * 2 if use_size and pd.notna(row['Member Count']) else 50
        ax.scatter(lon, lat, s=size, color=color, alpha=0.8, edgecolor='k', linewidth=0.5, zorder=5, transform=ccrs.PlateCarree())

    plt.savefig(OUTPUT_FILE, format='svg')
    print(f"✔ Map saved as high-res SVG: {OUTPUT_FILE}")
    subprocess.run(["open", OUTPUT_FILE])

def plot_locations_europe(data, use_size, separate_status):
    plt.figure(figsize=(18, 9))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent([-10, 40, 35, 70], crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS)
    ax.add_feature(cfeature.OCEAN, color='#f0f0f0')
    ax.add_feature(cfeature.LAND, color='#dddddd')

    # Filter data to only include European locations
    europe_data = data[(data['Latitude'] >= 35) & (data['Latitude'] <= 70) & 
                      (data['Longitude'] >= -10) & (data['Longitude'] <= 40)]

    for _, row in europe_data.iterrows():
        lat, lon = row['Latitude'], row['Longitude']
        color = 'green'
        size = row['Member Count'] * 2 if use_size and pd.notna(row['Member Count']) else 50
        ax.scatter(lon, lat, s=size, color=color, alpha=0.8, edgecolor='k', linewidth=0.5, zorder=5, transform=ccrs.PlateCarree())

    plt.savefig(OUTPUT_FILE_EUROPE, format='svg')
    print(f"✔ Europe map saved as high-res SVG: {OUTPUT_FILE_EUROPE}")
    subprocess.run(["open", OUTPUT_FILE_EUROPE])

def plot_locations_asia(data, use_size, separate_status):
    plt.figure(figsize=(18, 9))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent([60, 150, -10, 55], crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS)
    ax.add_feature(cfeature.OCEAN, color='#f0f0f0')
    ax.add_feature(cfeature.LAND, color='#dddddd')

    # Filter data to only include Asian locations
    asia_data = data[(data['Latitude'] >= -10) & (data['Latitude'] <= 55) & 
                    (data['Longitude'] >= 60) & (data['Longitude'] <= 150)]

    for _, row in asia_data.iterrows():
        lat, lon = row['Latitude'], row['Longitude']
        color = 'green'
        size = row['Member Count'] * 2 if use_size and pd.notna(row['Member Count']) else 50
        ax.scatter(lon, lat, s=size, color=color, alpha=0.8, edgecolor='k', linewidth=0.5, zorder=5, transform=ccrs.PlateCarree())

    plt.savefig(OUTPUT_FILE_ASIA, format='svg')
    print(f"✔ Asia map saved as high-res SVG: {OUTPUT_FILE_ASIA}")
    subprocess.run(["open", OUTPUT_FILE_ASIA])

def plot_locations_north_america(data, use_size, separate_status):
    plt.figure(figsize=(18, 9))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent([-170, -50, 15, 75], crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS)
    ax.add_feature(cfeature.OCEAN, color='#f0f0f0')
    ax.add_feature(cfeature.LAND, color='#dddddd')

    # Filter data to only include North American locations
    north_america_data = data[(data['Latitude'] >= 15) & (data['Latitude'] <= 75) & 
                             (data['Longitude'] >= -170) & (data['Longitude'] <= -50)]

    for _, row in north_america_data.iterrows():
        lat, lon = row['Latitude'], row['Longitude']
        color = 'green'
        size = row['Member Count'] * 2 if use_size and pd.notna(row['Member Count']) else 50
        ax.scatter(lon, lat, s=size, color=color, alpha=0.8, edgecolor='k', linewidth=0.5, zorder=5, transform=ccrs.PlateCarree())

    plt.savefig(OUTPUT_FILE_NORTH_AMERICA, format='svg')
    print(f"✔ North America map saved as high-res SVG: {OUTPUT_FILE_NORTH_AMERICA}")
    subprocess.run(["open", OUTPUT_FILE_NORTH_AMERICA])

def plot_locations_south_america(data, use_size, separate_status):
    plt.figure(figsize=(18, 9))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent([-85, -30, -60, 15], crs=ccrs.PlateCarree())
    ax.add_feature(cfeature.COASTLINE)
    ax.add_feature(cfeature.BORDERS)
    ax.add_feature(cfeature.OCEAN, color='#f0f0f0')
    ax.add_feature(cfeature.LAND, color='#dddddd')

    # Filter data to only include South American locations
    south_america_data = data[(data['Latitude'] >= -60) & (data['Latitude'] <= 15) & 
                             (data['Longitude'] >= -85) & (data['Longitude'] <= -30)]

    for _, row in south_america_data.iterrows():
        lat, lon = row['Latitude'], row['Longitude']
        color = 'green'
        size = row['Member Count'] * 2 if use_size and pd.notna(row['Member Count']) else 50
        ax.scatter(lon, lat, s=size, color=color, alpha=0.8, edgecolor='k', linewidth=0.5, zorder=5, transform=ccrs.PlateCarree())

    plt.savefig(OUTPUT_FILE_SOUTH_AMERICA, format='svg')
    print(f"✔ South America map saved as high-res SVG: {OUTPUT_FILE_SOUTH_AMERICA}")
    subprocess.run(["open", OUTPUT_FILE_SOUTH_AMERICA])

# === MAIN ===
def main():
    cache = load_cache()

    # Check if file exists and resolve alias if needed
    actual_file_path = INPUT_FILE
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Error: File '{INPUT_FILE}' not found.")
        print("Please make sure the file exists in the current directory.")
        return
    
    # If it's an alias (symlink), resolve to actual path
    if os.path.islink(INPUT_FILE):
        actual_file_path = os.readlink(INPUT_FILE)
        print(f"🔗 Resolved alias to: {actual_file_path}")
        
        # If it's a relative path, make it absolute
        if not os.path.isabs(actual_file_path):
            actual_file_path = os.path.join(os.path.dirname(INPUT_FILE), actual_file_path)
            
        if not os.path.exists(actual_file_path):
            print(f"❌ Error: Alias target '{actual_file_path}' not found.")
            return

    # Try different engines to read the Excel file
    df = None
    for engine in ['openpyxl', 'xlrd', None]:
        try:
            print(f"🔄 Trying to read Excel file with engine: {engine}")
            if engine:
                # Read the table directly if possible
                try:
                    df = pd.read_excel(actual_file_path, sheet_name=INPUT_SHEET, engine=engine)
                    # If there's a table named "Table1", try to find the data rows
                    print(f"📊 Raw data shape: {df.shape}")
                    print(f"📋 First few rows:\n{df.head()}")
                    
                    # Find where the actual data starts (look for "University" in first column)
                    start_row = 0
                    for idx, row in df.iterrows():
                        if str(row.iloc[0]).strip().lower() == 'university':
                            start_row = idx
                            break
                    
                    if start_row > 0:
                        df = pd.read_excel(actual_file_path, sheet_name=INPUT_SHEET, engine=engine, header=start_row)
                    
                except Exception:
                    df = pd.read_excel(actual_file_path, sheet_name=INPUT_SHEET, engine=engine, header=3)
            else:
                df = pd.read_excel(actual_file_path, sheet_name=INPUT_SHEET, header=3)
            print(f"✅ Successfully read file with engine: {engine}")
            print(f"📋 Column names: {list(df.columns)}")
            break
        except Exception as e:
            print(f"❌ Failed with engine {engine}: {e}")
            continue
    
    if df is None:
        print(f"❌ Could not read '{actual_file_path}'. Please check:")
        print("1. File is not corrupted")
        print("2. File is a valid Excel format (.xlsx or .xls)")
        print("3. Sheet name 'Schools --> Customers' exists")
        return

    def construct_location(row):
        # Use the first two columns which should be University and University Location
        university = str(row.iloc[0] if pd.notna(row.iloc[0]) else '').strip()
        location = str(row.iloc[1] if pd.notna(row.iloc[1]) else '').strip()
        
        # Skip header row if we encounter it
        if university.lower() == 'university':
            return ''
        
        # Combine university and location
        if university and location:
            return f"{university}, {location}"
        elif location:
            return location
        elif university:
            return university
        else:
            return ''

    df['Location String'] = df.apply(construct_location, axis=1)

    # Filter out empty locations
    df = df[df['Location String'] != '']

    if df.empty:
        print("❌ No valid university locations found in the data.")
        print("Available columns:", list(df.columns))
        return

    use_size = ask_user("Do you want the green dots to scale by member count? (yes/no): ")

    latitudes, longitudes = [], []
    for loc in df['Location String']:
        coords = geocode_location(loc, cache)
        if coords:
            latitudes.append(coords[0])
            longitudes.append(coords[1])
        else:
            latitudes.append(None)
            longitudes.append(None)

    df['Latitude'] = latitudes
    df['Longitude'] = longitudes
    df = df.dropna(subset=['Latitude', 'Longitude'])

    plot_locations(df, use_size, False)
    plot_locations_europe(df, use_size, False)
    plot_locations_asia(df, use_size, False)
    plot_locations_north_america(df, use_size, False)
    plot_locations_south_america(df, use_size, False)

if __name__ == '__main__':
    main()
