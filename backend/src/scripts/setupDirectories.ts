import { FileSystemUtils } from '../utils/fileSystem';
import path from 'path';

/**
 * Setup required directories for the application
 */
export const setupDirectories = async (): Promise<void> => {
  const directories = [
    path.join(process.cwd(), 'temp-uploads'),
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'logs'),
  ];

  console.log('🗂️  Setting up required directories...');

  for (const dir of directories) {
    try {
      await FileSystemUtils.ensureDirectory(dir);
      console.log(`✅ Directory created/verified: ${dir}`);
    } catch (error) {
      console.error(`❌ Failed to create directory ${dir}:`, error);
      throw error;
    }
  }

  console.log('✅ All directories setup complete');
};

// Run if called directly
if (require.main === module) {
  setupDirectories().catch(console.error);
}