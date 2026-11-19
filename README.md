
# Campus Digital Twin

**Cloud-Based Smart Campus Navigation & Management System for Career Point University, Kota**

**[Open the live Campus Digital Twin app](https://campus-digital-twin-kota.onrender.com)**

A new student may know their classroom number but still have two questions:
“Which building do I enter?” and “How do I walk there from the main gate?”

Campus Digital Twin connects a searchable room directory to an interactive
campus map. Students can find a building entrance, follow a saved walking
route, check a room’s availability, and report a problem from the same app.
Administrators maintain the campus information as rooms, facilities, and
walkways change.

## Try the project in one minute

1. Open the live app and sign in with a student account.
2. Go to **Navigation** and select **Main Gate Entrance** as your starting point.
3. Choose **Water Fountain** as your destination and click **Find walking route**.
   In the project demo, this connection is approximately **114 metres**.
4. Open **3D Campus**, select a marker, and switch between **Top view** and
   **3D tilt** to see the campus from another angle.

## What students can do

| Feature | How it helps |
| --- | --- |
| **Campus map and navigation** | Search for gates, hostels, the canteen, and other landmarks. Find the shortest route along saved campus walkways. |
| **Classrooms and labs** | Search by room or building, filter by floor or availability, and navigate to the linked building entrance. |
| **Faculty directory** | Look up a faculty member or department and see office details where they are available. |
| **Events and announcements** | Check a published event’s venue and timing, or see new notices while the announcements page is open. |
| **Maintenance reports** | Report an issue directly from a room entry, then track its status as **Open**, **In progress**, or **Resolved**. |

## How campus routing works

An administrator selects two locations and clicks along the walkway to mark
its bends. The app saves those coordinates and estimates the path length in
metres. **Dijkstra’s algorithm** compares the total lengths of the connected
walkways to find the shortest saved route.

This matters because two buildings can look close on a map even when there
is no direct path between them. If no saved walkway connects the selected
places, the app explains that a route is unavailable.

## Technology and project structure

- **[Frontend](./frontend):** React and Vite power the interface. Leaflet and
  React Leaflet display the 2D map. MapLibre GL displays MapTiler satellite
  imagery and terrain in the 3D view.
- **[Backend](./backend):** Node.js and Express handle authenticated room
  requests.
- **Cloud services:** Supabase provides login and PostgreSQL storage.
  Render hosts the frontend and backend.

## Current coverage and next steps

The project demonstration includes **18 mapped campus locations**. Room
availability reflects the last status entered by an administrator. The 3D
view shows satellite imagery over terrain; it does not include indoor floor
plans.

The next priority is to walk the mapped routes to verify entrances and
junctions, then confirm room numbers and faculty office details with each
department.

**Maintainer:** [@deepakCodes27](https://github.com/deepakCodes27)
