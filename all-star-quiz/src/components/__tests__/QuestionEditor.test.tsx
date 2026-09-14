import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuestionEditor } from '../admin/QuestionEditor';
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  api: {
    questions: {
      create: { mutate: mocks.create },
      update: { mutate: mocks.update },
      delete: { mutate: mocks.remove },
    },
  },
  apiErrorStatus: (cause: { status?: number }) => cause.status,
}));
const initial = {
  id: 'q',
  version: 3,
  question: '元の問題',
  choices: { A: '一', B: '二', C: '三', D: '四' },
  answer: 'B' as const,
  type: 'final' as const,
  timeLimit: 10 as const,
  category: '科学',
  explanation: null,
  choiceImages: {},
};
beforeEach(() => {
  vi.clearAllMocks();
});
it('previews edits and submits the original version for conflict protection', async () => {
  const saved = vi.fn();
  mocks.update.mockResolvedValue(initial);
  render(
    <QuestionEditor
      initial={initial}
      onSaved={saved}
      onCancel={vi.fn()}
      onUnauthorized={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText('問題文（500文字まで）'), {
    target: { value: '編集後の問題' },
  });
  expect(screen.getByText('編集後の問題', { selector: 'p' })).toBeVisible();
  fireEvent.click(screen.getByText('保存する'));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(mocks.update).toHaveBeenCalledWith({
    ...initial,
    question: '編集後の問題',
  });
});
it('requires an explicit deletion confirmation and retains edit data on conflict', async () => {
  mocks.remove.mockRejectedValue(
    new Error('問題が更新されています。一覧を読み直してください。')
  );
  render(
    <QuestionEditor
      initial={initial}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
      onUnauthorized={vi.fn()}
    />
  );
  fireEvent.click(screen.getByText('削除する'));
  expect(mocks.remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('削除を確定'));
  await waitFor(() =>
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      '問題が更新されています'
    )
  );
  expect(screen.getByLabelText('問題文（500文字まで）')).toHaveValue(
    '元の問題'
  );
});
it('blocks invalid image URLs before saving', () => {
  render(
    <QuestionEditor
      initial={initial}
      onSaved={vi.fn()}
      onCancel={vi.fn()}
      onUnauthorized={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText('画像URL A'), {
    target: { value: 'javascript:alert(1)' },
  });
  fireEvent.change(screen.getByLabelText('画像の説明 A'), {
    target: { value: '説明' },
  });
  fireEvent.click(screen.getByText('保存する'));
  expect(screen.getByRole('alert')).toHaveTextContent('画像URLを確認');
  expect(mocks.update).not.toHaveBeenCalled();
});
