import mongoose from 'mongoose';

// الرابط بتاع قاعدة البيانات من واقع اللوجات بتاعتك
const mongoURI = 'mongodb://localhost:27017/vibelab';

async function fixDatabase() {
    try {
        await mongoose.connect(mongoURI);
        console.log('✅ Connected to MongoDB.');

        const db = mongoose.connection.db;
        const collection = db.collection('users');

        // حذف الـ Index اللي بيعمل تعارض
        await collection.dropIndex('email_1');
        console.log('✅ Successfully dropped index: email_1');

    } catch (error) {
        if (error.codeName === 'IndexNotFound' || error.code === 27) {
            console.log('ℹ️ Index email_1 was not found, it might have been already dropped.');
        } else {
            console.error('❌ Error fixing database:', error.message);
        }
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

fixDatabase();
