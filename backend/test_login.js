const mongoose = require('mongoose');
const User = require('./models/User');
const jwt = require('jsonwebtoken');

const mongoURI = 'mongodb://127.0.0.1:27017/blockchain_health';
const JWT_SECRET = 'blockchain_health_secret_key_12345';

async function test() {
    try {
        await mongoose.connect(mongoURI);
        console.log('Connected to MongoDB.');
        
        const email = 'giddelalvin@gmail.com';
        const password = 'Password123';
        
        const user = await User.findOne({ email });
        if (!user) {
            console.log('User not found.');
            return;
        }
        
        console.log('Found user:', user.email, 'role:', user.role);
        
        console.log('Comparing password...');
        const isMatch = await user.comparePassword(password);
        console.log('Password match:', isMatch);
        
        if (isMatch) {
            console.log('Signing JWT...');
            const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
            console.log('JWT signed successfully:', token);
        }
        
        await mongoose.connection.close();
    } catch (err) {
        console.error('Test error encountered:', err);
    }
}

test();
