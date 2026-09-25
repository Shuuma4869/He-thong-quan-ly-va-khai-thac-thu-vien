import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, BookOpen, Eye, EyeOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Vui lòng nhập email hoặc mã thành viên.'),
  password: z.string().min(8, 'Mật khẩu cần có ít nhất 8 ký tự.'),
  remember: z.boolean(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '', remember: false },
  });

  const submit = async () => {
    setError('root', { message: 'Dịch vụ đăng nhập chưa được triển khai trong giai đoạn nền tảng.' });
  };

  return (
    <main className="login-page">
      <section className="login-brand" aria-labelledby="brand-title">
        <div className="login-brand-content">
          <Link className="inline-flex items-center gap-2 text-sm text-teal-50" to="/"><ArrowLeft size={16} /> Về trang chủ</Link>
          <div className="mt-16 flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.16em]"><BookOpen /> LAMS · Hệ thống quản lý thư viện</div>
          <h1 id="brand-title" className="editorial-title mt-8">Tìm sách nhanh hơn.<br />Quản lý thư viện gọn hơn.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-teal-50/80">Tra cứu sách, theo dõi lượt mượn và xử lý các nghiệp vụ thư viện trong một hệ thống thống nhất.</p>
          <div className="shelf-motif" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        </div>
      </section>
      <section className="login-form-panel">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="w-full max-w-md">
          <p className="eyebrow">Đăng nhập</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Chào mừng bạn quay lại</h2>
          <p className="mt-3 text-muted">Đăng nhập để tiếp tục sử dụng LAMS.</p>
          <form className="mt-8 grid gap-5" onSubmit={handleSubmit(submit)} noValidate>
            <label className="field"><span>Email hoặc mã thành viên</span><input autoComplete="username" placeholder="Nhập email hoặc mã thành viên" {...register('identifier')} />{errors.identifier && <small role="alert">{errors.identifier.message}</small>}</label>
            <label className="field"><span>Mật khẩu</span><span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" {...register('password')} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password && <small role="alert">{errors.password.message}</small>}</label>
            <div className="flex items-center justify-between gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" {...register('remember')} /> Ghi nhớ đăng nhập</label><button className="text-link" type="button">Quên mật khẩu?</button></div>
            {errors.root && <div className="form-notice" role="alert">{errors.root.message}</div>}
            <button className="button-primary w-full" disabled={isSubmitting} type="submit">{isSubmitting ? 'Đang xử lý…' : 'Đăng nhập'}</button>
          </form>
          <p className="mt-7 text-center text-sm text-muted">Chưa có tài khoản? <button className="text-link" type="button">Đăng ký</button></p>
        </motion.div>
      </section>
    </main>
  );
}
