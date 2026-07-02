import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
    {
        ignores: [
            'dist/**',
            'dist_electron*/**',
            'node_modules/**',
            'old_vanilla_site/**',
        ],
    },
    js.configs.recommended,
    {
        files: ['src/**/*.{js,jsx}', 'server/**/*.js', 'electron/**/*.js', 'vite.config.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
            globals: {
                ...globals.browser,
                ...globals.node,
                React: 'readonly',
            },
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        },
    },
]
