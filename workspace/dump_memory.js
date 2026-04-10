const lancedb = require('vectordb'); // or whatever they use
async function run() {
    try {
        const db = await lancedb.connect('/Users/mac/.openclaw/workspace/lancedb_data');
        const tbl = await db.openTable('structured_memory');
        const results = await tbl.query().limit(1000).execute();
        console.log(`========= TOTAL RECORDS: ${results.length} =========`);
        results.forEach((r, i) => {
            console.log(`--- Record ${i+1} ---`);
            console.log(r.text);
        });
    } catch(e) {
        console.error(e);
    }
}
run();
