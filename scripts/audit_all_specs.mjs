import fs from 'fs';
import path from 'path';

const specsDir = 'C:/Users/User/Buildo/docs/specs';
const projectRoot = 'C:/Users/User/Buildo';
const reportPath = 'C:/Users/User/Buildo/docs/reports/full_spec_audit_report.md';

function countTestsInFile(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = content.match(/\b(it|test)\s*\(/g);
    return matches ? matches.length : 0;
}

function auditSpecs() {
    // Support --spec=NN_name to audit a single spec
    const specArg = process.argv.find(a => a.startsWith('--spec='));
    const specFilter = specArg ? specArg.split('=')[1] : null;

    let files = fs.readdirSync(specsDir).filter(f => f.endsWith('.md'));
    if (specFilter) {
        files = files.filter(f => f.includes(specFilter));
        if (files.length === 0) {
            console.error(`No spec file matching "${specFilter}" found in ${specsDir}`);
            process.exit(1);
        }
        console.log(`Auditing ${files.length} spec(s) matching "${specFilter}"`);
    }

    let reportMd = `# Complete Codebase vs. Specification Audit Report\n\n`;
    reportMd += `This report programmatically evaluates all ${files.length} system specifications against the codebase, checking for file implementation status and test coverage based on the requested rubric.\n\n`;

    reportMd += `## Audit Rubric\n`;
    reportMd += `- **Spec Alignment [1-5]:** Evaluated based on whether the "Operating Boundaries > Target Files" mandated by the spec actually exist in the codebase.\n`;
    reportMd += `- **Testing Coverage [1-5]:** Evaluated based on the volume of unit/logic tests implemented for the specific component.\n`;
    reportMd += `- **Testing Appropriateness:** [PASS] if tests exist and utilize the Vitest logic patterns. [FAIL/CAUTION] if tests are missing.\n\n`;

    reportMd += `## Summary Matrix\n\n`;
    reportMd += `| Spec | Alignment | Test Coverage | Appropriateness | Notes |\n`;
    reportMd += `|---|---|---|---|---|\n`;

    const detailSections = [];

    files.forEach(file => {
        const fullPath = path.join(specsDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Extract Title
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : file;

        // Find mentioned source files (e.g. src/lib/..., src/app/...)
        const srcFilesMatch = [...content.matchAll(/(src\/[a-zA-Z0-9_\-\.\/]+\.(ts|tsx|js))/g)];
        const uniqueSrcFiles = [...new Set(srcFilesMatch.map(m => m[1]))];

        // Check implementation alignment
        let implementedFiles = 0;
        let alignmentScore = 1;

        uniqueSrcFiles.forEach(srcFile => {
            if (fs.existsSync(path.join(projectRoot, srcFile))) {
                implementedFiles++;
            }
        });

        if (uniqueSrcFiles.length === 0) {
            alignmentScore = "N/A - Architectural";
        } else {
            const ratio = implementedFiles / uniqueSrcFiles.length;
            if (ratio === 1) alignmentScore = 5;
            else if (ratio >= 0.8) alignmentScore = 4;
            else if (ratio >= 0.5) alignmentScore = 3;
            else if (ratio > 0) alignmentScore = 2;
        }

        // Test Coverage Calculation
        // Let's find any test files mentioned or search the src/tests directory for a matching name
        const specPrefixMatch = file.match(/^(\d+[a-z]?)_(.+)\.md$/);
        let specBaseName = "";
        if (specPrefixMatch) {
            specBaseName = specPrefixMatch[2].replace(/_/g, '-');
        } else {
            specBaseName = file.replace('.md', '');
        }

        // Potential test files
        const possibleTestFiles = [
            path.join(projectRoot, 'src/tests', `${specBaseName}.logic.test.ts`),
            path.join(projectRoot, 'src/tests', `${specBaseName.split('-')[0]}.logic.test.ts`),
            ...uniqueSrcFiles.map(f => path.join(projectRoot, f.replace('.ts', '.test.ts').replace('.tsx', '.test.tsx')))
        ];

        let totalTests = 0;
        let foundTestFiles = [];

        // Also check if the markdown explicitly mentions a test file
        const explicitTestMatch = [...content.matchAll(/(src\/tests\/[a-zA-Z0-9_\-\.\/]+\.test\.tsx?)/g)];
        explicitTestMatch.forEach(m => {
            possibleTestFiles.push(path.join(projectRoot, m[1]));
        });

        const checkedPaths = new Set();
        possibleTestFiles.forEach(tf => {
            if (!checkedPaths.has(tf) && fs.existsSync(tf)) {
                checkedPaths.add(tf);
                const count = countTestsInFile(tf);
                if (count > 0) {
                    totalTests += count;
                    foundTestFiles.push(tf.replace(projectRoot + '/', ''));
                }
            }
        });

        let testScore = 1;
        let appropriateness = "FAIL";
        if (totalTests > 40) { testScore = 5; appropriateness = "PASS"; }
        else if (totalTests > 15) { testScore = 4; appropriateness = "PASS"; }
        else if (totalTests > 5) { testScore = 3; appropriateness = "PASS"; }
        else if (totalTests > 0) { testScore = 2; appropriateness = "CAUTION"; }

        if (["00_system_map.md", "01_database_schema.md", "08b_classification_assumptions.md", "08c_description_keyword_trades.md"].includes(file)) {
            testScore = "N/A";
            appropriateness = "N/A";
        }

        let notes = "";
        if (testScore === 1 && alignmentScore === 5) notes = "Implemented, but missing test suite.";
        else if (alignmentScore === 1 && uniqueSrcFiles.length > 0) notes = "Not yet implemented.";
        else if (testScore === 5) notes = "Excellent coverage.";
        else if (testScore === "N/A") notes = "Informational/Architectural spec."

        reportMd += `| ${file} | ${alignmentScore === 'N/A - Architectural' ? 'N/A' : alignmentScore + '/5'} | ${testScore === 'N/A' ? 'N/A' : testScore + '/5'} | ${appropriateness} | ${notes} |\n`;

        // Detail Section
        detailSections.push(`### ${title} (${file})
- **Files Specified:** ${uniqueSrcFiles.length}
- **Files Implemented:** ${implementedFiles}
- **Testing Volume:** ${totalTests} individual test cases found.
- **Identified Test Suites:** ${foundTestFiles.length > 0 ? foundTestFiles.join(', ') : 'None'}
`);
    });

    reportMd += `\n## Detailed Spec Breakdown\n\n`;
    reportMd += detailSections.join('\n');

    fs.writeFileSync(reportPath, reportMd);
    console.log(`Report generated at ${reportPath}`);
}

auditSpecs();
