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
            lines: 75,
            functions: 90,
            branches: 65,
            statements: 75,
            perFile: true
        }
    }
});
