import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import { destinationFor, useAuth } from './auth-context';
import { AuthHero } from './AuthHero';

const schema = z.object({
  fullName: z.string().trim().min(1, 'Vui lòng nhập họ và tên.').max(150),
  email: z.email('Email không hợp lệ.'),
  password: z.string().min(8, 'Mật khẩu cần có ít nhất 8 ký tự.').max(128),
  confirmPassword: z.string(),
}).refine(value => value.password === value.confirmPassword,
  { path: ['confirmPassword'], message: 'Mật khẩu nhập lại không khớp.' });
type RegisterForm = z.infer<typeof schema>;

export function RegisterPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const reduceMotion = useReducedMotion();
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  });
  const submit = async (form: RegisterForm) => {
    try {
      const user = await auth.register(form.fullName, form.email, form.password);
      navigate(destinationFor(user), { replace: true });
    } catch (error) {
      setError('root', { message: error instanceof ApiError ? error.message : 'Không thể kết nối. Vui lòng thử lại.' });
    }
  };
  return <main className="login-page">
    <AuthHero />
    <section className="login-form-panel"><motion.div initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="w-full max-w-md">
      <p className="eyebrow">Tài khoản mới</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Tạo tài khoản</h2>
      <p className="mt-3 text-muted">Điền thông tin cơ bản để bắt đầu sử dụng thư viện.</p>
      <form className="mt-8 grid gap-5" onSubmit={handleSubmit(submit)} noValidate>
        <label className="field"><span>Họ và tên</span><input autoComplete="name" {...register('fullName')} />{errors.fullName && <small role="alert">{errors.fullName.message}</small>}</label>
        <label className="field"><span>Email</span><input type="email" autoComplete="email" {...register('email')} />{errors.email && <small role="alert">{errors.email.message}</small>}</label>
        <label className="field"><span>Mật khẩu</span><span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('password')} /><button type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>{errors.password && <small role="alert">{errors.password.message}</small>}</label>
        <label className="field"><span>Nhập lại mật khẩu</span><input type="password" autoComplete="new-password" {...register('confirmPassword')} />{errors.confirmPassword && <small role="alert">{errors.confirmPassword.message}</small>}</label>
        {errors.root && <div className="form-notice" role="alert">{errors.root.message}</div>}
        <button className="button-primary w-full" disabled={isSubmitting} type="submit">{isSubmitting ? 'Đang xử lý…' : 'Đăng ký'}</button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">Đã có tài khoản? <Link className="text-link" to="/dang-nhap">Đăng nhập</Link></p>
    </motion.div></section>
  </main>;
}
