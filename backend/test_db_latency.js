const db = require('./db');

async function testDbLatency() {
    console.log('=== Database Latency Test ===');
    for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await db.query('SELECT 1');
        const duration = Date.now() - start;
        console.log(`Query ${i + 1}: SELECT 1 took ${duration}ms`);
    }

    const startQuery = Date.now();
    await db.query("SELECT * FROM users LIMIT 1");
    console.log(`Fetch user: SELECT * FROM users LIMIT 1 took ${Date.now() - startQuery}ms`);

    process.exit(0);
}

testDbLatency();
