const express = require('express');
const xlsx = require('xlsx');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4000;  // Use Heroku's port or default to 4000

app.use(cors());

// Function to load and parse the Excel file asynchronously
const loadData = async () => {
    const filePath = path.join(__dirname, 'data.xlsx');
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });

    const semesterData = [];
    const gpaData = [];

    // Loop through the first four sheets and store data for semester results
    for (let i = 0; i < Math.min(4, workbook.SheetNames.length); i++) {
        const sheetName = workbook.SheetNames[i];
        const sheet = workbook.Sheets[sheetName];
        const sheetData = xlsx.utils.sheet_to_json(sheet);

        sheetData.forEach(record => {
            record['Semester'] = sheetName; // Assign the sheet name to the Semester field
        });

        semesterData.push(...sheetData);
    }

    // Load the fifth sheet for GPA data, if it exists
    if (workbook.SheetNames.length > 4) {
        const gpaSheet = workbook.Sheets[workbook.SheetNames[4]];
        gpaData.push(...xlsx.utils.sheet_to_json(gpaSheet));
    }

    return { semesterData, gpaData };
};

// API endpoint to get results by registration number from semester sheets
app.get('/api/results/:year/:department/:number', async (req, res) => {
    const { year, department, number } = req.params;
    const regNo = `${year}/${department}/${number}`; // Construct the full registration number

    const { semesterData, gpaData } = await loadData(); // Load data from the Excel file

    // Validate registration number format
    const regNoRegex = /^\d{4}\/[A-Za-z]+\/\d{4}$/; // Example: "2020/CS/1234"
    if (!regNoRegex.test(regNo)) {
        return res.status(400).json({ message: 'Invalid registration number format.' });
    }

    // Filter semester data by registration number
    const filteredResults = semesterData.filter((record) => record['Reg.No'] === regNo);

    if (filteredResults.length > 0) {
        const name = filteredResults[0]['Name'] || filteredResults[0]['Name_1']; // Get the name from the first record
        const semesterResults = {};
        let overallGpa = 0;
        let totalSemesters = 0;

        // Gather results semester-wise and calculate overall GPA
        filteredResults.forEach((result) => {
            const semesterKey = result['Semester']; // Use the assigned sheet name as the semester key

            if (!semesterResults[semesterKey]) {
                semesterResults[semesterKey] = {
                    courses: [],
                    semesterGPA: 0, // Initialize semester GPA
                };
            }

            const courseData = {};
            Object.entries(result)
                .filter(([key]) => !['Reg.No', 'Name', 'Name_1', 'GPA', 'Semester', 'Reg. No', 'Reg.No_1'].includes(key))
                .forEach(([key, value]) => {
                    courseData[key] = value; // Combine subject results
                });

            if (Object.keys(courseData).length > 0) {
                semesterResults[semesterKey].courses.push(courseData);
            }

            const semesterGPA = parseFloat(result['GPA']); // Assuming GPA is available in the result
            if (!isNaN(semesterGPA)) {
                semesterResults[semesterKey].semesterGPA = semesterGPA; // Store semester GPA
                overallGpa += semesterGPA;
                totalSemesters++;
            }
        });

        overallGpa = totalSemesters > 0 ? (overallGpa / totalSemesters).toFixed(2) : 0;

        // Get OCGPA from the GPA data, if available
        const gpaRecord = gpaData.find(record => record['Reg.No'] === regNo);
        const ocGPA = gpaRecord ? gpaRecord['OCGPA'] : 'N/A'; // Assuming OCGPA is present in the GPA sheet

        // Prepare the final response
        res.json({
            regNo,
            name,
            semesterResults,
            overallGpa: overallGpa, // Overall GPA calculated from semester results
            ocGPA: ocGPA // Include OCGPA, default to 'N/A' if not found
        });
    } else {
        res.status(404).json({ message: 'No results found for the given registration number.' });
    }
});

loadData().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}).catch(err => {
    console.error('Error loading data:', err);
    process.exit(1); // Exit the process if data loading fails
});
