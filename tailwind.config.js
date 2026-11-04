/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        workspace: '#929DB4',
        canvas: '#EEF0F1',
        card: '#FFFFFF',
        'text-primary': '#20283A',
        'text-secondary': '#718096',
        'accent-orange': '#E95435',
        'accent-orange-hover': '#D84527',
        'accent-blue': '#79A9D1',
        'accent-blue-hover': '#6897BE',
        'accent-blue-light': '#EBF3F9',
        'border-subtle': '#E3E6E9',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.03), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
      }
    }
  },
  plugins: [],
}
