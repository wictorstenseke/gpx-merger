# GPX Merger

A beautiful, browser-based tool for merging multiple GPX files with advanced activity tracking features. Built with vanilla JavaScript, featuring interactive maps and heart rate visualization.

## ✨ Features

### 🚴 Activity Modes
- **Cycling Mode**: Displays average speed (km/h) and cycling-focused metrics
- **Running Mode**: Shows pace (min/km) and running-specific data
- Smart filename generation based on time of day and activity type
  - Examples: "Morning Bike Ride", "Afternoon Run", "Evening Bike Ride"

### ❤️ Heart Rate Tracking
- **Smoothed Heart Rate Chart**: Visual representation of HR throughout your activity
- Distance-based x-axis for easy correlation with route sections
- **HR Statistics**: Average, Maximum, and Minimum heart rate
- Compatible with Apple Watch and Garmin GPX files
- Heart rate data preserved in merged exports

### 🗺️ Interactive Map
- Real-time route visualization using Leaflet and OpenStreetMap
- Start and end point markers
- Auto-zoom to route bounds

### 📊 Comprehensive Statistics
- **Distance**: Total distance with elevation gain
- **Duration**: Total activity time
- **Speed/Pace**: Context-aware based on activity mode
- **Elevation**: Gain and loss tracking

### 🔧 Smart Merging
- Automatic file merging by timestamp
- **Time Gap Removal**: Optional feature to remove gaps between activities
- Multiple file support via drag-and-drop or file browser
- All processing done locally in your browser (no uploads)

## 🚀 Getting Started

### Installation

Simply open `index.html` in a modern web browser. No build process or dependencies to install!

```bash
# Clone or download the repository
git clone [repository-url]

# Open in browser
open index.html
```

### Usage

1. **Upload GPX Files**
   - Drag and drop GPX files onto the upload area, or
   - Click "Browse files" to select files from your device

2. **Select Activity Mode**
   - Click the bicycle icon for cycling activities
   - Click the running icon for running activities

3. **Review Your Data**
   - View your route on the interactive map
   - Check the heart rate chart (if HR data is available)
   - Review statistics in the data panel

4. **Download Merged File**
   - Edit the filename if desired
   - Click "Download Merged GPX" to save the merged file
   - All original data (including heart rate) is preserved

## 📁 Project Structure

```
gpx-merger/
├── demo/               # Demo GPX files for testing
├── index.html          # Main HTML structure
├── styles.css          # Styling (shadcn/ui inspired design)
├── script.js           # Core functionality and GPX processing
└── README.md           # This file
```

## 🛠️ Technical Details

### Technologies Used
- **HTML5**: Semantic markup
- **CSS3**: Clean, modern styling with Tailwind utility classes
- **Vanilla JavaScript**: No framework dependencies
- **Leaflet.js**: Interactive map rendering
- **Canvas API**: Heart rate chart visualization

### GPX Data Support
- **Standard GPX 1.1 format**
- Latitude, Longitude, Elevation
- Timestamps
- Heart Rate (via Garmin TrackPointExtension format)

### Browser Compatibility
- Chrome, Firefox, Safari, Edge (latest versions)
- Requires JavaScript enabled
- Canvas API support for heart rate charts

## 🎨 Design Philosophy

Built following shadcn/ui design principles:
- Clean, minimal aesthetic
- Balanced spacing and rounded corners
- Subtle shadows and clear contrast
- Accessible (WCAG AA compliant)
- Responsive layout

## 🔒 Privacy

All GPX file processing happens entirely in your browser. No data is uploaded to any server. Your activity data stays private and local to your device.

## 📝 File Naming Convention

The app automatically generates descriptive filenames based on:
- **Time of Day**: Morning, Lunch, Afternoon, Evening, Night
- **Activity Type**: Bike Ride or Run
- **Format**: `[Time] [Activity]` (e.g., "Morning Bike Ride.gpx")

You can always edit the filename before downloading.

## 🤝 Contributing

This is a static web project. Feel free to:
- Report issues or suggest features
- Submit pull requests with improvements
- Fork and customize for your needs

## 📄 License

[Add your license here]

## 🙏 Acknowledgments

- **OpenStreetMap**: Map data and tiles
- **Leaflet**: Interactive mapping library
- **Garmin**: TrackPointExtension schema for heart rate data
- **shadcn/ui**: Design inspiration

---

Built with ❤️ for fitness enthusiasts who want to analyze and merge their activities.

