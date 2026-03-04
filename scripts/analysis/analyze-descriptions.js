const fs = require('fs');
const path = require('path');

const JSON_FILE = path.join(__dirname, '../building-permits-active-permits.json');

// Common English stop words and construction-specific noise words
const STOP_WORDS = new Set([
    'and', 'or', 'to', 'for', 'of', 'the', 'in', 'on', 'with', 'a', 'an', 'at',
    'by', 'as', 'will', 'be', 'this', 'that', 'from', 'is', 'are', 'was', 'were',
    'it', 'its', 'has', 'have', 'all', 'any', 'new', 'existing', 'building', 'permit',
    'work', 'proposed', 'construct', 'construction', 'dwelling', 'unit', 'units',
    'house', 'residential', 'commercial', 'floor', 'story', 'storey', 'storeys',
    'single', 'family', 'detached', 'semi', 'interior', 'exterior', 'alterations',
    'alteration', 'addition', 'additions', 'part', 'rear', 'front', 'side', 'basement',
    'first', 'second', 'third', 'ground', 'main', 'level', 'roof', 'wall', 'walls',
    'remove', 'replace', 'install', 'installation', 'create', 'into', 'under', 'over',
    'using', 'one', 'two', 'three', 'four', 'only', 'also', 'not', 'no', 'yes',
    'per', 'see', 'drawings', 'plans', 'plan', 'application', 'file', 'owner',
    'property', 'lot', 'line', 'lines', 'which', 'other', 'related', 'associated',
    'including', 'include', 'project', 'sf', 'sq', 'ft', 'm', 'use', 'change', 'up',
    'down', 'out', 'back', 'room', 'rooms', 'area', 'space', 'spaces', 'rear', 'front',
    'side', 'build', 'buildings', 'permits', 'works', 'constructs', 'constructed',
    'attached', 'non', 'above', 'below', 'within'
]);

function tokenize(text) {
    if (!text) return [];
    // Lowercase, remove punctuation, split by whitespace
    return text.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.has(word) && isNaN(word));
}

async function analyze() {
    console.log(`Analyzing descriptions from ${JSON_FILE}...`);

    if (!fs.existsSync(JSON_FILE)) {
        console.error(`File not found: ${JSON_FILE}`);
        process.exit(1);
    }

    const raw = fs.readFileSync(JSON_FILE, 'utf-8');
    console.log('Parsing JSON...');
    const records = JSON.parse(raw);

    // permitType -> word -> count
    const wordCounts = {};
    let totalRows = 0;

    for (const row of records) {
        totalRows++;
        const permitType = row.PERMIT_TYPE || 'Unknown';
        const description = row.DESCRIPTION || '';

        if (!wordCounts[permitType]) {
            wordCounts[permitType] = {};
        }

        const words = tokenize(description);
        for (const word of words) {
            wordCounts[permitType][word] = (wordCounts[permitType][word] || 0) + 1;
        }
    }

    console.log(`Processed ${totalRows} permits.\n`);

    // Generate Report
    let report = `# Permit Description Concept Analysis\n\n`;
    report += `Based on an exhaustive analysis of ${totalRows.toLocaleString()} active building permits, here are the top 20 concepts/words found within the \`DESCRIPTION\` field, categorized by **Permit Type**.\n\n`;
    report += `> [!NOTE]\n> Common stop-words (and, the, a) and generic construction terms (e.g. "new", "building", "permit", "work", "construct", "residential", "commercial", "story") were intentionally stripped out to reveal the actual specific work concepts.\n\n`;

    const types = Object.keys(wordCounts).sort();

    for (const type of types) {
        const counts = wordCounts[type];
        const sortedWords = Object.entries(counts)
            .sort((a, b) => b[1] - a[1]) // Sort by count descending
            .slice(0, 20);

        if (sortedWords.length === 0) continue;

        report += `## ${type}\n`;
        report += `| Rank | Concept/Word | Frequency |\n`;
        report += `|---|---|---|\n`;

        sortedWords.forEach(([word, count], index) => {
            report += `| ${index + 1} | **${word}** | ${count.toLocaleString()} |\n`;
        });
        report += `\n`;
    }

    const outputPath = path.join(__dirname, '../permit_concepts_report.md');
    fs.writeFileSync(outputPath, report);

    console.log(`Report generated successfully at permit_concepts_report.md`);
}

analyze().catch(console.error);
