import '@testing-library/jest-dom';

// Environment variables requeridas por los módulos bajo test
process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long!!';
process.env.ZERNIO_API_KEY = 'test-zernio-key';
process.env.ZERNIO_API_URL = 'https://zernio.com/api/v1';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
