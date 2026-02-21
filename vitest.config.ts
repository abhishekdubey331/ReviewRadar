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
            lines: 40,
            functions: 40,
            branches: 35,
            statements: 40,
            perFile: false
        }
    }
});
