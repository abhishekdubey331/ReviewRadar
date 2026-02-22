import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
    },
    coverage: {
        enabled: true,
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.ts'],
        exclude: [
            'src/index.ts',
            'src/**/*.test.ts',
            'src/domain/ports/**/*.ts'
        ],
        thresholds: {
            lines: 60,
            functions: 40,
            branches: 40,
            statements: 60,
            perFile: true
        }
    }
});
