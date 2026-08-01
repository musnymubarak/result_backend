const express = require('express');
const xlsx = require('xlsx');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Path to data.xlsx
const excelPath = path.join(__dirname, 'data.xlsx');

let semesterData = [];
let gpaData = [];
let sheetNames = [];

function loadData() {
    semesterData = [];
    gpaData = [];
    
    try {
        const workbook = xlsx.readFile(excelPath);
        sheetNames = workbook.SheetNames;
        console.log(`[INFO] Loaded Excel workbook with sheets: ${sheetNames.join(', ')}`);

        // Find OGPA / GPA sheet
        const ogpaSheetName = sheetNames.find(name => name.toUpperCase().includes('OGPA') || name.toUpperCase().includes('GPA')) || sheetNames[sheetNames.length - 1];
        
        // Semester sheets are all sheets except OGPA sheet
        const semesterSheetNames = sheetNames.filter(name => name !== ogpaSheetName);

        semesterSheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            const sheetData = xlsx.utils.sheet_to_json(sheet);
            
            sheetData.forEach(record => {
                record['Semester'] = sheetName; // Tag with semester name (e.g. 1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 4.1, 4.2)
            });

            semesterData.push(...sheetData);
        });

        // Load master OGPA sheet
        if (workbook.Sheets[ogpaSheetName]) {
            const gpaSheet = workbook.Sheets[ogpaSheetName];
            gpaData = xlsx.utils.sheet_to_json(gpaSheet);
            console.log(`[INFO] Loaded ${gpaData.length} records from ${ogpaSheetName} sheet.`);
        }
    } catch (error) {
        console.error(`[ERROR] Failed to load data.xlsx:`, error.message);
    }
}

// Initial data load
loadData();

// Utility function to format reg number
function formatRegNo(year, department, number) {
    if (year && department && number) {
        return `${year}/${department}/${number}`;
    }
    return null;
}

// API endpoint to get student results by year/department/number
app.get('/api/results/:year/:department/:number', (req, res) => {
    const { year, department, number } = req.params;
    const regNo = formatRegNo(year, department, number);

    getStudentResult(regNo, res);
});

// Alternative endpoint allowing direct full regNo query (e.g., /api/student?regNo=2020/ICT/30)
app.get('/api/student', (req, res) => {
    const regNo = req.query.regNo;
    if (!regNo) {
        return res.status(400).json({ message: 'Missing regNo query parameter.' });
    }
    getStudentResult(regNo, res);
});

function getStudentResult(regNo, res) {
    const filteredResults = semesterData.filter(record => {
        const rNo = record['Reg.No'] || record['Reg. No'] || record['RegNo'];
        return rNo && rNo.trim().toUpperCase() === regNo.trim().toUpperCase();
    });

    const gpaRecord = gpaData.find(record => {
        const rNo = record['Reg.No'] || record['Reg. No'] || record['RegNo'];
        return rNo && rNo.trim().toUpperCase() === regNo.trim().toUpperCase();
    });

    if (filteredResults.length > 0 || gpaRecord) {
        const name = (gpaRecord && gpaRecord['Name']) || 
                     (filteredResults.length > 0 && (filteredResults[0]['Name'] || filteredResults[0]['Name_1'])) || 
                     'N/A';

        const semesterResults = {};

        filteredResults.forEach(result => {
            const semesterKey = result['Semester'];

            if (!semesterResults[semesterKey]) {
                semesterResults[semesterKey] = {
                    courses: [],
                    semesterGPA: 0,
                };
            }

            const courseData = {};
            Object.entries(result)
                .filter(([key]) => !['Reg.No', 'Name', 'Name_1', 'GPA', 'Semester', 'Reg. No', 'Reg.No_1', 'Index No'].includes(key))
                .forEach(([key, value]) => {
                    courseData[key] = value;
                });

            if (Object.keys(courseData).length > 0) {
                semesterResults[semesterKey].courses.push(courseData);
            }

            const semesterGPA = parseFloat(result['GPA']);
            if (!isNaN(semesterGPA) && semesterGPA > 0) {
                semesterResults[semesterKey].semesterGPA = semesterGPA;
            }
        });

        // Determine official OCGPA from master sheet or calculated
        const finalOCGPA = gpaRecord ? (gpaRecord['Final OCGPA (Degree)'] || gpaRecord['OCGPA'] || 'N/A') : 'N/A';
        const threeYearGPA = gpaRecord ? (gpaRecord['3-Year OCGPA (90 Cr)'] || 'N/A') : 'N/A';
        const year4GPA = gpaRecord ? (gpaRecord['Year 4 GPA (30 Cr)'] || 'N/A') : 'N/A';
        const degreeTrack = gpaRecord ? (gpaRecord['Degree Track'] || 'General (90 Cr)') : 'General (90 Cr)';
        const degreeClass = gpaRecord ? (gpaRecord['Degree Class'] || 'N/A') : 'N/A';

        return res.json({
            regNo,
            name,
            degreeTrack,
            degreeClass,
            overallGpa: finalOCGPA !== 'N/A' ? parseFloat(finalOCGPA).toFixed(3) : 'N/A',
            ocGPA: finalOCGPA !== 'N/A' ? parseFloat(finalOCGPA).toFixed(3) : 'N/A',
            threeYearGpa: threeYearGPA !== 'N/A' ? parseFloat(threeYearGPA).toFixed(3) : 'N/A',
            year4Gpa: year4GPA !== 'N/A' && !isNaN(parseFloat(year4GPA)) ? parseFloat(year4GPA).toFixed(3) : 'N/A',
            gpaDetails: gpaRecord || {},
            semesterResults
        });
    } else {
        return res.status(404).json({ message: `No results found for registration number: ${regNo}` });
    }
}

// Get all students summary
app.get('/api/students', (req, res) => {
    const list = gpaData.map(record => ({
        regNo: record['Reg.No'],
        name: record['Name'],
        threeYearGPA: record['3-Year OCGPA (90 Cr)'],
        year4GPA: record['Year 4 GPA (30 Cr)'],
        finalOCGPA: record['Final OCGPA (Degree)'] || record['OCGPA'],
        degreeTrack: record['Degree Track'],
        degreeClass: record['Degree Class']
    }));
    res.json({ total: list.length, students: list });
});

// Get overall batch statistics
app.get('/api/stats', (req, res) => {
    const validGpas = gpaData.map(r => parseFloat(r['Final OCGPA (Degree)'] || r['OCGPA'])).filter(v => !isNaN(v));
    const honorsStudents = gpaData.filter(r => r['Degree Track'] && r['Degree Track'].includes('120'));

    const classCounts = {};
    gpaData.forEach(r => {
        const cls = r['Degree Class'] || 'Unclassified';
        classCounts[cls] = (classCounts[cls] || 0) + 1;
    });

    res.json({
        totalStudents: gpaData.length,
        honoursStudentsCount: honorsStudents.length,
        generalStudentsCount: gpaData.length - honorsStudents.length,
        batchAverageOCGPA: validGpas.length ? (validGpas.reduce((a, b) => a + b, 0) / validGpas.length).toFixed(3) : 'N/A',
        degreeClassDistribution: classCounts
    });
});

// Refresh data from Excel on demand
app.post('/api/reload', (req, res) => {
    loadData();
    res.json({ message: 'Data reloaded successfully from data.xlsx', totalStudents: gpaData.length });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});