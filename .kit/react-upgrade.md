# Upgrading vanilla JS to React

Step-by-step conversion when your vanilla project needs more interactivity.

## When to upgrade

You'll know it's time when you find yourself:
- Writing lots of `document.querySelector` and manual DOM updates
- Managing complex state across multiple elements
- Duplicating HTML structure in JavaScript strings
- Building interactive forms, filters, or dynamic lists

## Step 1: Install React

```bash
npm install react react-dom
npm install -D @vitejs/plugin-react
```

## Step 2: Update Vite config

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
  },
})
```

## Step 3: Update index.html

```html
<!-- Replace your existing script tag -->
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
```

## Step 4: Create React entry point

```jsx
// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './style.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

## Step 5: Create root component

```jsx
// src/App.jsx
export default function App() {
  return (
    <div>
      <h1>My App</h1>
      {/* Move your HTML structure here */}
    </div>
  )
}
```

## Step 6: Extract components

Move sections of your HTML into components in `src/components/`:
- Header, Footer, Nav → layout components
- Repeated elements → reusable components
- Interactive sections → stateful components with `useState`/`useEffect`

## Step 7: Update tests

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

```jsx
// tests/App.test.jsx
import { render, screen } from '@testing-library/react'
import App from '../src/App'

test('renders heading', () => {
  render(<App />)
  expect(screen.getByRole('heading')).toBeInTheDocument()
})
```

## Notes

- Tailwind CSS classes work identically in JSX — no changes needed
- Commit after each step so you can revert if something breaks
- Your existing utility functions in `src/utils/` carry over unchanged
- For complex state (multiple components sharing data), add Zustand: `npm install zustand`
