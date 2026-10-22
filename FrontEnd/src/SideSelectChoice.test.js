import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import SideSelectModal from './SideSelectChoice';

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); delete global.fetch; });

test('keeps side selection open after a failed request and permits retry', async () => {
  global.fetch = jest.fn()
    .mockRejectedValueOnce(new Error('Connection interrupted'))
    .mockResolvedValueOnce({ ok: true, json: async () => 'saved' });
  const setShow = jest.fn();
  render(<SideSelectModal show setShow={setShow} gameId="abcde" team={2} mapName="Ascent" />);
  fireEvent.click(screen.getByRole('button', { name: 'Attack', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
  expect(setShow).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Attack', exact: true }));
  await waitFor(() => expect(setShow).toHaveBeenCalledWith(false));
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ gameId: 'abcde', team: 2, side: 1, mapName: 'Ascent' });
});

test('automatic side selection sends one request under StrictMode', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => 'saved' });
  const setShow = jest.fn();
  render(<React.StrictMode><SideSelectModal show setShow={setShow} gameId="abcde" team={1} mapName="Haven" /></React.StrictMode>);
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(setShow).toHaveBeenCalledWith(false);
});
