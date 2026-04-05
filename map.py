from mpl_toolkits.basemap import Basemap
import matplotlib.pyplot as plt

# Create map
m = Basemap(projection='merc', llcrnrlat=30, urcrnrlat=70, llcrnrlon=-10, urcrnrlon=40)
m.drawcountries()

# Example: Plot Berlin
x, y = m(13.4050, 52.5200)  # lon, lat
m.plot(x, y, 'ro', markersize=10)  # Red dot
plt.text(x, y, 'Berlin', fontsize=12)

plt.show()