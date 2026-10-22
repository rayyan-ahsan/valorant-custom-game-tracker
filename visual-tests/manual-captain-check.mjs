// A separate UI driver stands in for the human only during -Verify runs.
// It knows nothing about server state and exercises the manual waiting paths.
export async function exerciseManualCaptain(page, format, done) {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const actions = { draft: 0, vote: 0, map: 0, side: 0 };
  while (!done()) {
    const draft = page.locator('[data-testid^="draft-"].selectable');
    const submit = page.getByRole('button', { name: 'Submit Vote', exact: true });
    const side = page.getByRole('button', { name: 'Defense', exact: true });
    if (await draft.count()) {
      await draft.last().click();
      actions.draft++;
    } else if (await submit.isVisible()) {
      await page.getByTestId(`vote-${format}`).click();
      await submit.click();
      actions.vote++;
    } else if (await side.isVisible()) {
      await side.click();
      actions.side++;
    } else if (await page.getByRole('heading', { name: /^Your Turn to (Ban|Pick) a Map$/ }).isVisible()) {
      const maps = page.locator('[data-testid^="map-"].map-container:not(.disabled)');
      if (await maps.count()) { await maps.last().click(); actions.map++; }
    }
    await wait(800);
  }
  return actions;
}
