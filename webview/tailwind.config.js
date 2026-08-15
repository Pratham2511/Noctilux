/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        qm: {
          bg: 'var(--vscode-editor-background)',
          fg: 'var(--vscode-editor-foreground)',
          accent: 'var(--vscode-textLink-foreground)',
          border: 'var(--vscode-panel-border)',
          hover: 'var(--vscode-list-hoverBackground)',
          good: '#4ec9b0',
          warn: '#d4a017',
          bad: '#f14c4c',
        },
      },
      fontFamily: {
        mono: 'var(--vscode-editor-font-family, ui-monospace, monospace)',
        sans: 'var(--vscode-font-family, system-ui, sans-serif)',
      },
    },
  },
  plugins: [],
};
