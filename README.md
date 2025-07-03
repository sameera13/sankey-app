📊 Client Journey Visualization Dashboard
This is a React-based web application designed to visualize client journeys through various service touchpoints using an interactive Sankey diagram. By uploading an Excel file containing session and event data, users can gain insights into customer flow, identify common paths, and pinpoint drop-off points.

✨ Features
Excel File Upload: Easily upload .xls or .xlsx files containing session and event data.

Interactive Sankey Diagram: Visualizes the flow of sessions between different service events.

Node Percentages: Displays the percentage of total sessions that reach each event node directly on the chart.

Hover Details: Provides detailed information (session count, percentage) on hover for both nodes and links.

Client Filtering: Filter the data by specific client IDs to analyze individual client journeys.

Session Summary: Displays key metrics like total sessions, completed sessions, and dropped sessions with percentages.

Responsive Design: Adapts to different screen sizes for optimal viewing.

Dynamic Chart Sizing: The chart's height adjusts based on the number of unique clients to minimize overlap.

🚀 Technologies Used
React: A JavaScript library for building user interfaces.

Plotly.js (via react-plotly.js): For creating the interactive Sankey diagram.

SheetJS (xlsx): For parsing and reading Excel files.

Tailwind CSS: A utility-first CSS framework for rapid styling.

⚙️ Setup
To run this project locally, follow these steps:

Clone the repository:

git clone <repository-url>
cd <repository-name>

(Replace <repository-url> and <repository-name> with your actual repository details if this is a new project.)

Install dependencies:

npm install

Start the development server:

npm run dev

The application will typically open in your browser at http://localhost:5173 (or another port if 5173 is in use).

📝 Usage
Upload an Excel File:

Click the "📁 Choose Excel File" button.

Select your .xls or .xlsx file.

The application expects the following columns in your Excel sheet (case-insensitive, but common variations are handled):

strClientId (or similar, for client ID)

strSessionId (or similar, for session ID)

MethodName (or similar, for the event/method name)

View the Sankey Diagram:

Once the file is loaded, the interactive Sankey diagram will automatically generate, visualizing the flow of sessions.

Nodes represent events (or clients/drop-offs), and links represent the flow of sessions between them.

Percentages on nodes indicate the proportion of total sessions that reached that specific event.

Filter by Client ID:

Use the "Filter by Client ID" input field to narrow down the visualization to sessions belonging to a specific client. The chart will update dynamically.

Interpret the Chart:

Node Labels: Show a shortened event name and the percentage of total sessions reaching that node.

Hover Tooltips: Hover over any node or link to see more detailed information, including full event names, session counts, and exact percentages.

Link Thickness: The thickness of the links represents the volume of sessions flowing between events.

"Dropped @" Nodes: Red nodes labeled "DROP @ [Event]" indicate sessions that ended their journey at that particular event without completing the full flow to "SubmitOrder".

