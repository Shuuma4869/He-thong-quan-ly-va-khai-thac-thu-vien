import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { coreApi } from '../../shared/api/client';
import { CirculationError } from './CirculationStates';
import { formatTime } from './circulation-labels';

const reasons = {
  CONDITIONAL: 'Ước tính theo hàng chờ hiện tại', READY: 'Sách đã sẵn sàng; xem hạn nhận trong yêu cầu.',
  CLOSED: 'Yêu cầu đã kết thúc. Tải lại danh sách để xem trạng thái mới.',
  AWAITING_EXPIRY: 'Một giữ chỗ đã tới hạn và đang chờ hệ thống xử lý.',
  BRANCH_INACTIVE: 'Chi nhánh nhận hiện không hoạt động.', READER_INELIGIBLE: 'Người mượn hiện chưa đủ điều kiện nhận sách.',
  SCOPE_TOO_LARGE: 'Hàng chờ hoặc số bản sách vượt phạm vi ước tính hiện tại.',
  INCONSISTENT_COPY: 'Thông tin bản sách cần được nhân viên đối chiếu.',
  OVERDUE_COPY: 'Có bản sách liên quan đã tới hạn hoặc quá hạn trả; chưa biết khi nào sách trở lại.',
  FUTURE_QUEUE_TIME: 'Thời điểm trong hàng chờ cần được kiểm tra.',
  NO_COMPATIBLE_COPY: 'Chưa có bản phù hợp đang lưu thông tại chi nhánh này.',
  QUEUE_CHANGED: 'Hàng chờ đã thay đổi; hãy tải lại yêu cầu.',
};
const estimateSchema = z.object({ holdId: z.string().uuid(), holdVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  asOf: z.string().datetime(), estimatedAt: z.string().datetime().nullable(), reason: z.enum(Object.keys(reasons) as [keyof typeof reasons, ...(keyof typeof reasons)[]]),
  policyVersion: z.string(), compatibleCopies: z.number().int().nonnegative(), waitingAhead: z.number().int().nonnegative() });

export function HoldEstimate({ owner, holdId, version }: { owner: string; holdId: string; version: number }) {
  const [opened, setOpened] = useState(false);
  const estimate = useQuery({ queryKey: ['circulation', owner, 'estimate', holdId, version],
    queryFn: async ({ signal }) => estimateSchema.parse(await coreApi.get(`/holds/${holdId}/estimate`, true, signal)), enabled: opened, retry: false });
  return <div className="my-3">
    <button className="button-secondary" disabled={opened && estimate.isFetching} onClick={() => { if (opened) void estimate.refetch(); else setOpened(true); }}>
      {opened ? 'Tính lại thời gian dự kiến' : 'Xem thời gian dự kiến'}</button>
    {opened && (estimate.isPending ? <p role="status">Đang tính từ hàng chờ…</p> : estimate.isError ? <CirculationError error={estimate.error} reload={() => void estimate.refetch()}/>
      : <div className="my-3 text-sm" aria-label="Ước tính giữ chỗ">
        {estimate.data.reason === 'CONDITIONAL' && estimate.data.estimatedAt ? <>
          <p>Có thể đến lượt khoảng ngày <strong>{new Date(estimate.data.estimatedAt).toLocaleDateString('vi-VN')}</strong>.</p>
          <p className="my-2">Đây là mô phỏng, chưa phải thông báo đến nhận. Giả định mọi người phía trước vẫn nhận sách, nhận vào cuối hạn và trả đúng hạn, không gia hạn; số bản và chính sách không đổi.</p>
        </> : <p>{reasons[estimate.data.reason]}</p>}
        <p>Tính lúc {formatTime(estimate.data.asOf)}. Hàng chờ, hạn trả hoặc điều kiện mượn thay đổi có thể làm kết quả khác đi.</p>
        {estimate.data.holdVersion !== version && <p className="my-2">Yêu cầu đã đổi kể từ lúc mở danh sách. Tải lại để xem trạng thái mới nhất.</p>}
      </div>)}
  </div>;
}
