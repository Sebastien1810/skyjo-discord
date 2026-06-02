function createDeck() {
  const deck = [];
  for (let i = 0; i < 5; i++) deck.push(-2);
  for (let i = 0; i < 10; i++) deck.push(-1);
  for (let i = 0; i < 15; i++) deck.push(0);
  for (let v = 1; v <= 12; v++) {
    for (let i = 0; i < 10; i++) deck.push(v);
  }
  return deck; // 150 cartes
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealGrid(deck) {
  const grid = [];
  for (let r = 0; r < 3; r++) {
    grid[r] = [];
    for (let c = 0; c < 4; c++) {
      grid[r][c] = { value: deck.pop(), faceUp: false };
    }
  }
  return grid;
}

function checkColumnsToRemove(grid) {
  if (!grid || grid.length === 0 || grid[0].length === 0) return [];
  const cols = [];
  const colCount = grid[0].length;
  for (let c = 0; c < colCount; c++) {
    if (
      grid[0][c].faceUp &&
      grid[1][c].faceUp &&
      grid[2][c].faceUp &&
      grid[0][c].value === grid[1][c].value &&
      grid[1][c].value === grid[2][c].value
    ) {
      cols.push(c);
    }
  }
  return cols;
}

function removeColumns(grid, cols) {
  if (!cols.length) return grid;
  return grid.map(row => row.filter((_, i) => !cols.includes(i)));
}

function allFaceUp(grid) {
  if (!grid || grid.length === 0) return true;
  return grid.every(row => row.every(c => c.faceUp));
}

function roundScore(grid) {
  if (!grid) return 0;
  return grid.reduce((s, row) => s + row.reduce((rs, c) => rs + c.value, 0), 0);
}

function visibleScore(grid) {
  if (!grid) return 0;
  return grid.reduce(
    (s, row) => s + row.filter(c => c.faceUp).reduce((rs, c) => rs + c.value, 0),
    0
  );
}

module.exports = {
  createDeck,
  shuffle,
  dealGrid,
  checkColumnsToRemove,
  removeColumns,
  allFaceUp,
  roundScore,
  visibleScore,
};
