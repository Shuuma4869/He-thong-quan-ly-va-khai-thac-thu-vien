import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { destinationFor, useAuth } from './auth-context';
import { ApiError } from '../../shared/api/client';
import { AuthHero } from './AuthHero';

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Vui lòng nhập email hoặc mã thành viên.'),
  password: z.string().min(8, 'Mật khẩu cần có ít nhất 8 ký tự.'),
  remember: z.boolean(),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '', remember: false },
  });

  const submit = async (form: LoginForm) => {
    try {
      const user = await auth.login(form.identifier, form.password, form.remember);
      navigate(destinationFor(user), { replace: true });
    } catch (error) {
      setError('root', { message: error instanceof ApiError ? error.message : 'Không thể kết nối. Vui lòng thử lại.' });
    }
  };

  return (
    <main className="login-page">
      <AuthHero />
      <section className="login-form-panel">
        <motion.div initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="w-full max-w-md">
          <p className="eyebrow">Đăng nhập</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Chào mừng bạn quay lại</h2>
          <p className="mt-3 text-muted">Đăng nhập để tiếp tục sử dụng LAMS.</p>
          <form className="mt-8 grid gap-5" onSubmit={handleSubmit(submit)} noValidate>
            <label className="field"><span>Email hoặc mã thành viên</span><input autoComplete="username" placeholder="Nhập email hoặc mã thành viên" {...register('identifier')} />{errors.identifier && <small role="alert">{errors.identifier.message}</small>}</label>
            <label className="field"><span>Mật khẩu</span><span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" {...register('password')} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password && <small role="alert">{errors.password.message}</small>}</label>
            <div className="login-aux-row"><label className="flex items-center gap-2"><input type="checkbox" {...register('remember')} /> Ghi nhớ đăng nhập</label><span className="text-muted">Quên mật khẩu? Sẽ bổ sung sau.</span></div>
            {errors.root && <div className="form-notice" role="alert">{errors.root.message}</div>}
            <button className="button-primary w-full" disabled={isSubmitting} type="submit">{isSubmitting ? 'Đang xử lý…' : 'Đăng nhập'}</button>
          </form>
          <p className="mt-7 text-center text-sm text-muted">Chưa có tài khoản? <Link className="text-link" to="/dang-ky">Đăng ký</Link></p>
        </motion.div>
      </section>
    </main>
  );
}
