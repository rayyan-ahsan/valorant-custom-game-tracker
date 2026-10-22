import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BOPollVote from './BestOfSeriesPoll';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

function props(votes) {
  return { show: true, handleClose: jest.fn(), votes, hasVoted: false,
    setHasVoted: jest.fn(), handleSubmitVote: jest.fn(), gameId: 'abcde', setFinalResult: jest.fn() };
}

test('six votes leave the poll open for the remaining players', () => {
  global.fetch = jest.fn();
  const options = props({ bo1: 6, bo2: 0, bo3: 0 });
  render(<BOPollVote {...options} />);
  expect(screen.getByRole('button', { name: 'Submit Vote' })).toBeInTheDocument();
  expect(options.handleClose).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('ten votes finalize once through the server, including StrictMode', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => 'bo2' });
  const options = props({ bo1: 2, bo2: 7, bo3: 1 });
  render(<React.StrictMode><BOPollVote {...options} /></React.StrictMode>);
  await waitFor(() => expect(options.setFinalResult).toHaveBeenCalledWith('bo2'));
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(options.handleClose).toHaveBeenCalledTimes(1);
});

test('a failed vote stays available for retry instead of marking it submitted', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  const options = props({ bo1: 0, bo2: 0, bo3: 0 });
  render(<BOPollVote {...options} />);
  fireEvent.click(screen.getByTestId('vote-bo1'));
  fireEvent.click(screen.getByRole('button', { name: 'Submit Vote' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not submit your vote');
  expect(options.setHasVoted).not.toHaveBeenCalled();
  expect(options.handleSubmitVote).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Submit Vote' })).toBeEnabled();
});
