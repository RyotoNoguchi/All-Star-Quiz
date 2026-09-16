import { randomUUID } from 'node:crypto';
import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import type { PrivateGameSnapshot } from '../src/types/game';
const baseURL = process.env.QUIZ_E2E_BASE_URL!;
const rpc = async <T>(
  request: APIRequestContext,
  path: string,
  input: unknown,
  mutation = false
): Promise<T> => {
  const response = mutation
    ? await request.post(`/api/trpc/${path}`, {
        data: input,
        headers: { origin: baseURL },
      })
    : await request.get(`/api/trpc/${path}`, {
        params: { input: JSON.stringify(input) },
      });
  expect(
    response.ok(),
    `${path} returned ${response.status()}: ${await response.text()}`
  ).toBeTruthy();
  const body = await response.json();
  return body.result.data as T;
};
const snapshot = (request: APIRequestContext, code: string) =>
  rpc<PrivateGameSnapshot>(request, 'games.snapshot', { code });
const create = async (request: APIRequestContext, name: string) =>
  (
    await rpc<{ room: { code: string } }>(
      request,
      'rooms.create',
      { name },
      true
    )
  ).room.code;
const join = (request: APIRequestContext, code: string, name: string) =>
  rpc(request, 'rooms.join', { code, name }, true);
const command = async (
  request: APIRequestContext,
  code: string,
  action: 'start' | 'next' | 'cancel'
) => {
  const state = await snapshot(request, code);
  return rpc(
    request,
    'games.command',
    {
      gameId: state.gameId,
      expectedVersion: state.version,
      requestId: randomUUID(),
      action,
    },
    true
  );
};
const prepare = (request: APIRequestContext, code: string, count = 1) =>
  rpc(request, 'questions.prepareGame', { code, count, category: 'E2E' }, true);
const connected = (page: Page) =>
  expect(page.getByText('接続済み・最新の状態です')).toBeVisible();

test('independent mobile players create, join, answer, reconnect, win and read history with a large monitor', async ({
  browser,
  page,
  context,
}) => {
  const peerContext = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
  });
  let peer = await peerContext.newPage();
  try {
    await page.goto('/');
    await page.getByLabel('表示名').fill('E2E ホスト');
    await page.getByRole('button', { name: '新しいルームを作る' }).click();
    await connected(page);
    const code = new URL(page.url()).searchParams.get('room')!;
    await peer.goto('/');
    await peer.getByLabel('表示名').fill('E2E 参加者');
    await peer.getByLabel('ルームコード', { exact: true }).fill(code);
    await peer.getByRole('button', { name: 'ルームに参加する' }).click();
    await connected(peer);
    await page.getByLabel('出題数').fill('2');
    await page.getByLabel('カテゴリ').fill('E2E');
    await page.getByRole('button', { name: '問題セットを準備する' }).click();
    await expect(page.getByText('準備済み：2問')).toBeVisible();
    const monitor = await context.newPage();
    await monitor.setViewportSize({ width: 1920, height: 1080 });
    await monitor.goto(`/monitor?room=${code}`);
    await expect(
      monitor.getByRole('heading', { name: 'All Star Quiz', exact: true })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'ゲームを開始', exact: true })
      .click();
    await Promise.all([
      page
        .getByRole('button', { name: '選択肢A: 青', exact: true })
        .press('Enter'),
      peer.getByRole('button', { name: '選択肢B: 赤', exact: true }).click(),
    ]);
    await expect(peer.getByText('不正解のため脱落しました。')).toBeVisible();
    await expect(
      monitor.getByRole('heading', { name: '✓ 正解：A', exact: true })
    ).toBeVisible();
    await peer.close();
    peer = await peerContext.newPage();
    await peer.goto(`/?room=${code}`);
    await connected(peer);
    await expect(peer.getByText('不正解のため脱落しました。')).toBeVisible();
    await page.getByRole('button', { name: '次の問題へ', exact: true }).click();
    await page
      .getByRole('button', { name: '選択肢A: 青', exact: true })
      .press('Enter');
    await expect(page.getByText('あなたが優勝しました！')).toBeVisible();
    await expect(
      peer.getByRole('heading', { name: '最終結果', exact: true })
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'このゲームの個人成績を見る' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'E2E ホスト の成績' })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /第2問：/ })).toBeVisible();
    await page.getByRole('button', { name: '履歴一覧へ戻る' }).press('Enter');
    await expect(page.getByText('2.0問', { exact: true })).toBeVisible();
    await peer
      .getByRole('link', { name: 'このゲームの個人成績を見る' })
      .click();
    await expect(peer.getByRole('heading', { name: /第1問：/ })).toBeVisible();
    await expect(peer.getByRole('heading', { name: /第2問：/ })).toHaveCount(0);
    for (const surface of [page, peer, monitor]) {
      expect(
        await surface.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth
        )
      ).toBe(true);
    }
  } finally {
    await peerContext.close();
  }
});

test('host departure transfers controls and an unrelated browser cannot read a saved game', async ({
  browser,
  page,
  context,
}) => {
  const peerContext = await browser.newContext({ baseURL });
  const stranger = await browser.newContext({ baseURL });
  try {
    const code = await create(context.request, '退出ホスト');
    await join(peerContext.request, code, '後任ホスト');
    await page.goto(`/?room=${code}`);
    const peer = await peerContext.newPage();
    await peer.goto(`/?room=${code}`);
    await connected(peer);
    await connected(page);
    await page.getByRole('button', { name: 'ルームから退出' }).click();
    await expect(
      peer.getByRole('button', { name: '問題セットを準備する' })
    ).toBeVisible();
    await peer.getByRole('button', { name: 'ゲームを終了・中止' }).click();
    await peer.getByRole('button', { name: '中止を確定' }).click();
    await expect(
      peer.getByRole('heading', { name: '最終結果', exact: true })
    ).toBeVisible();
    const state = await snapshot(peerContext.request, code);
    const outsider = await stranger.newPage();
    await outsider.goto('/history');
    await expect(
      outsider.getByText('このブラウザーでは履歴を確認できません')
    ).toBeVisible();
    await create(stranger.request, '無関係');
    await outsider.goto(`/history?game=${state.gameId}`);
    await expect(
      outsider
        .getByRole('alert')
        .filter({ hasText: 'この履歴は見つかりません' })
    ).toContainText('この履歴は見つかりません');
    await expect(outsider.getByText('後任ホスト の成績')).toHaveCount(0);
  } finally {
    await peerContext.close();
    await stranger.close();
  }
});

test('two rooms each accept 20 simultaneous participants and answers without leaking or duplicating results', async ({
  playwright,
}) => {
  const clients = await Promise.all(
    Array.from({ length: 40 }, () => playwright.request.newContext({ baseURL }))
  );
  try {
    const codes = await Promise.all([
      create(clients[0]!, '負荷A'),
      create(clients[20]!, '負荷B'),
    ]);
    await Promise.all(
      clients.map((client, i) =>
        i % 20 === 0
          ? Promise.resolve()
          : join(client, codes[Math.floor(i / 20)]!, `参加者${i}`)
      )
    );
    await Promise.all(codes.map((code, i) => prepare(clients[i * 20]!, code)));
    await Promise.all(
      codes.map((code, i) => command(clients[i * 20]!, code, 'start'))
    );
    const states = await Promise.all([
      snapshot(clients[0]!, codes[0]!),
      snapshot(clients[20]!, codes[1]!),
    ]);
    expect(states.map((state) => state.players.length)).toEqual([20, 20]);
    const inputs = clients.map((_, i) => {
      const state = states[Math.floor(i / 20)]!;
      return {
        gameId: state.gameId,
        questionId: state.question!.id,
        choice: 'A',
        requestId: randomUUID(),
      };
    });
    const started = Date.now();
    const receipts = await Promise.all(
      clients.map((client, i) => rpc(client, 'answers.submit', inputs[i], true))
    );
    console.log(
      `40 concurrent HTTP answers completed in ${Date.now() - started}ms`
    );
    expect(await rpc(clients[0]!, 'answers.submit', inputs[0], true)).toEqual(
      receipts[0]
    );
    for (const [room, code] of codes.entries()) {
      await expect
        .poll(async () => (await snapshot(clients[room * 20]!, code)).phase)
        .toBe('finished');
      const final = (await snapshot(clients[room * 20]!, code)).result!;
      expect(final.finalRanking).toHaveLength(20);
      expect(final.statistics.totalAnswers).toBe(20);
      expect(final.winnerId).toBeTruthy();
      expect(
        final.finalRanking.every((entry) =>
          states[room]!.players.some((player) => player.id === entry.playerId)
        )
      ).toBe(true);
      expect(
        (await rpc<{ total: number }>(clients[room * 20]!, 'history.list', {}))
          .total
      ).toBe(1);
    }
    const denied = await clients[0]!.get('/api/trpc/games.snapshot', {
      params: { input: JSON.stringify({ code: codes[1] }) },
    });
    expect(denied.status()).toBe(403);
  } finally {
    await Promise.all(clients.map((client) => client.dispose()));
  }
});

for (const mode of ['wrong', 'timeout'] as const) {
  test(`all ${mode} participants finish without a winner`, async ({
    playwright,
  }) => {
    const host = await playwright.request.newContext({ baseURL });
    const peer = await playwright.request.newContext({ baseURL });
    try {
      const code = await create(host, '全員終了');
      await join(peer, code, '参加者');
      await prepare(host, code);
      await command(host, code, 'start');
      const state = await snapshot(host, code);
      if (mode === 'wrong')
        await Promise.all(
          [host, peer].map((request) =>
            rpc(
              request,
              'answers.submit',
              {
                gameId: state.gameId,
                questionId: state.question!.id,
                choice: 'B',
                requestId: randomUUID(),
              },
              true
            )
          )
        );
      await expect
        .poll(async () => (await snapshot(host, code)).phase)
        .toBe('finished');
      const result = (await snapshot(host, code)).result!;
      expect(result.winnerId).toBeUndefined();
      expect(
        result.finalRanking.map((entry) => entry.survivedQuestions)
      ).toEqual([0, 0]);
    } finally {
      await host.dispose();
      await peer.dispose();
    }
  });
}
