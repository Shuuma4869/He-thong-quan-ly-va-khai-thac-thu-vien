import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';

@Injectable()
export class LoanDueReminderJob implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(LoanDueReminderJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly repository: NotificationRepository) {}

  onApplicationBootstrap() {
    const enabled = process.env.CIRCULATION_REMINDERS_ENABLED ?? 'true';
    if (!['true', 'false'].includes(enabled)) throw new Error('CIRCULATION_REMINDERS_ENABLED phải là true hoặc false.');
    if (enabled === 'false') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 15 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      const count = await this.repository.createDueReminders();
      if (count) this.log.log(`Đã tạo ${count} thông báo nhắc hạn trả.`);
    } catch (error) {
      this.log.error('Không tạo được nhắc hạn trả; sẽ thử lại ở chu kỳ kế tiếp.',
        error instanceof Error ? error.stack : String(error));
    } finally {
      this.running = false;
    }
  }
}
