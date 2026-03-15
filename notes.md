1. **Grid Rendering**:
    - Display a **10x10** colour-coded grid based on a given metric (e.g., "pressure", "temperature").
    - **Bonus:** Allow dynamic grid sizing user specified parameter (e.g. if user provides grid size etc.)
2. **Data Preparation & Visualisation:**
    - Convert raw values into a format which can be displayed on the grid via a utility function.
    - Example format:
        
        ```json
        
        {
          "iterations": [
            { "step": 1, "values": [[0, 0, 10], [1, 1, 20], [2, 2, 30]] },
            { "step": 2, "values": [[0, 0, 15], [1, 1, 25], [2, 2, 35]] }
          ]
        }
        
        ```
        
    - Simulate **step-by-step updates** by progressively changing cell colours.
3. **Interactivity**:
    - A **"Play" button** to animate the result visualisation.
    - **Tooltip on hover** showing row, column, and value.
    - **Bonus:** Get creative with interactions! Consider adding features like:
        - **Pause/Resume** controls for better playback control.
        - **Step-through navigation** to manually move betIen iterations.
        - **Adjustable speed settings** for animation.
        - **Click to highlight** specific grid cells for deeper inspection.
4. **Visualisation**:
    - Use a **colour scale** (e.g., blue for low values, red for high).
    - Dynamically update colours as iterations progress.
5. **Data fetching:** 
    - Handle **API updates & errors gracefully**.
    - Expand the API setup as needed.


----
API
Queing system - Handle the API responses in queues
Throughput 
Loss packets?

Pagination - Server pagination

How do I avoid re-renders?


React state is the quickest

Polling data?
------

Non-Techincal Solution:
Why are we doing this?

Since we are talking about 'Temperature' or 'Pressure' data, I am assuming a 3D object which is under testing.

Let's considere a Porsche 911 having pressure sensors across the car's body to monitor the pressure at different points. The grid could represent the car's surface, and the colour-coding could indicate areas of high or low pressure. This would allow engineers to visualize how the pressure changes across the car's surface during testing or real-world driving conditions.

Assuming 
* Length: ≈ 4.54 m
* Width: ≈ 1.85 m
* Height: ≈ 1.30 m

Bounding box surface area: A=2(LW+LH+WH) ≈33.4 m2
Adjusting for rounded car shape: Cars typically have ~65–75% of the box surface area due to curvature and wheel cutouts ≈23 m2 or 230,000 cm2

Assuming a 'Flush Pressure Taps', diameter: ~2–6 mm
Surface sensing area: roughly 1–5 mm²

Assuming each sensor is about 10 cm apart, I can calculate the number of sensors needed to cover the car's surface: ~2300

Although this 2300 for a single iteration - I don't need to send 'each' sensor's data for every iteration. I need to show the data based on 'viewport' of the grid. For example, if the user is only looking at a 10x10 section of the grid, I can send data for that section only, which would be 100 cells per iteration.

Since I am talking about a 3D object, a user will only view it from a single 'viewport' which may only show a portion of the grid at a time. Therefore, I can optimize data transmission by only sending the relevant data for the current viewport, rather than the entire grid. This would significantly reduce the amount of data sent to the client and improve performance.

------
Technical Solution:

How to run the project:

To run the server:
node server.js

To run the React app:
npm install && npm run dev

Proceed to open the app in the browser at http://localhost:5173

How to run tests for the project:

For the server (whlie having the ):


For the React app:
npm run test 


------

Transmission:
Smoother transmission can be acheived if I implement a queuing system on the server side and client side to handle the API responses. This would allow me to manage the flow of data and ensure that the client receives updates in a timely manner without overwhelming it with too much data at once.

Pagination and Viewport Optimization:
To further optimize data transmission, I can implement pagination on the server side to limit the amount of data sent to the client at once. For example, I could send data for 3 iterations at a time. The client can then request the next set of iterations as needed. Additionally, I can optimize data transmission by only sending the relevant data for the current viewport, rather than the entire grid. This would significantly reduce the amount of data sent to the client and improve performance.


Testing with larger datasets:
To test the performance of the application with larger datasets, I can simulate a larger grid (e.g., 100x100) and generate random data for it. This would allow me to evaluate how well the application handles larger datasets and identify any potential bottlenecks or performance issues that may arise with larger grids. 

Part 1. Server

Total data? 
The data json is 3x3 for 11 steps = 99 cells. I can just send over the 'entire' data for the 

To consider scalability, I can implement pagination on the server side to limit the amount of data sent to the client at once. For example, I could send data for 2 iterations at a time (200 cells), and the client can request the next set of iterations as needed.


Pagination:
Rather than waiting for all iterations to load before showing anything, the server now sends them in small chunks of 3 at a time. The first chunk loads alongside the grid so the user can start playing immediately. The rest arrive quietly in the background — each chunk gets processed and added to what's already there. If the user tries to step forward before the next chunk has arrived, the button is simply disabled until it's ready.


Future changes: 

3D Object:
I believe a large amount of gain can come from optimising for 3D objects specifically. Since the grid is representing a 3D object, I can take advantage of the fact that users will only be viewing a portion of the grid at a time (the viewport). Therefore, I can optimize data transmission by only sending the relevant data for the current viewport, rather than the entire grid. This would significantly reduce the amount of data sent to the client and improve performance.



Part 2. UI
Grid structure:
For a 3x3 grid, I have taken left to right and top to bottom as the order of the cells. So, the first cell (0,0) would be the top-left corner, and the next cell (0,1) would be the top-middle, and fourth cell (1,0) would be the left middle. This way, I can easily map the data from the API to the correct cells in the grid.

If I increase from 3x3 to 10×10 that's 100 nodes, at 100×100 it's 10,000, at 1000×1000 it's 1,000,000 — all causing layout, style recalc, and React diffing overhead.

Instead I should create a cavas element which is used to render the grid. This way, I can draw the grid and update it efficiently without worrying about DOM overhead. I can use the canvas API to draw the grid and update it as needed based on the data received from the API.

And for the tooltip I can just use coordinate rather than DOM event bubbling, and a ResizeObserver redraws on container resize.

Precompute colours:
When the data loads, I work out the colour for every cell at every step upfront and store it — so when you hit Play, there's nothing left to calculate. The colour range is fixed from the full dataset so colours stay consistent as you step through. Each step only processes the cells that actually changed, not the whole grid. At playback time, moving to the next step is just looking up what I already prepared — no recomputing, no React re-rendering, just a single canvas redraw.

Handling missing data and errors:
Missing or bad values — if a cell has no data, or the value can't be read (empty, null, a string that isn't a number), I show it as a neutral grey with a "—" label rather than letting it silently turn black or break the colour scale. Bad values are excluded when calculating the colour range so one broken cell doesn't skew the whole grid.

Bad API responses — before I try to use the data, I check it has the shape I expect. If something is missing or wrong, I show a clear error message ("API error: grid.pressure is not an array") rather than a cryptic crash.

Out-of-range updates — if an iteration says "update cell (row 99, col 99)" but the grid is only 3×3, I skip it rather than writing into memory I don't own.

Repaint on demand:
Rather than trying to update the grid every time new data arrives, I can use a flag to track whether a repaint is needed. When new data comes in, I set the flag to true. Then, in the animation loop, I check the flag and only redraw the grid if it's set. This way, I avoid unnecessary redraws and improve performance.

Reserve Canvas height and width:
To prevent layout shifts when the grid is first rendered, I can set a fixed width and height for the canvas element based on the expected grid size. This way, the canvas will reserve the necessary space in the layout from the start, and I won't have to worry about it resizing as data loads in.

Slider to control animation speed:
I can add a slider input to allow users to adjust the animation speed. I have assumed the fastest speed to be 5 iterations per second and the slowest to be 0.5 iterations per second. The slider can be implemented using an HTML range input, and I can use its value to control the timing of the animation loop.

States:
I don't believe an external state library is required since we're only managing a few pieces of state (current step, animation speed, whether the animation is playing). Adding Redux or Zustand would be overkill.

Filter:
Since I precompute the cells at every step upfront, the filter can compute during render time efficiently. When the filter is enabled, I pass a min-max range to the canvas draw functions. Each cell's display value is parsed back to a number and compared against the range. Cells inside the range are drawn at full opacity; cells outside are drawn at 12% opacity.

When you switch metrics, the filter resets. This is intentional: temperature and pressure operate on completely different numeric scales, so carrying a filter from one to the other would produce meaningless results.

I deliberately avoided precomputing filtered snapshots. Doing so would multiply memory usage by the number of possible filter states, which is unbounded. Since the filter check is just a numeric comparison per cell and runs in the browser's native canvas compositor (not through React), the cost is negligible even for large grids.
