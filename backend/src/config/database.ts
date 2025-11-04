import { Sequelize } from 'sequelize-typescript';
import { User } from '../models/User';
import { Video } from '../models/Video';
import { Analysis } from '../models/Analysis';
import { ViolenceDetection } from '../models/ViolenceDetection';

// Use SQLite for development if PostgreSQL is not available
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = databaseUrl && databaseUrl.includes('postgresql');

const sequelize = usePostgres 
  ? new Sequelize(databaseUrl!, {
      dialect: 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
      models: [User, Video, Analysis, ViolenceDetection],
    })
  : new Sequelize({
      dialect: 'sqlite',
      storage: './dev-database.sqlite',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      models: [User, Video, Analysis, ViolenceDetection],
    });

export const connectDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully');
    
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Database models synchronized');
    }
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
};

export { sequelize };