async function test() {
    try {
        const response = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'giddelalvin@gmail.com', password: 'Password123' })
        });
        const status = response.status;
        const data = await response.json();
        console.log('Status Code:', status);
        console.log('Response Body:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

test();
