import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
});

afterEach(() => {
  global.fetch = originalFetch;
});

test('renders navigation for a visitor who is not logged in', () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole('link', { name: 'HLT Queue' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute('href', '/stats');
  expect(screen.getByRole('button', { name: 'Login / Sign Up' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Lobby' })).not.toBeInTheDocument();
});
