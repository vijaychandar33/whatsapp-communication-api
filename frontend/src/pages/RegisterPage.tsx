import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

const schema = z.object({
  organizationName: z.string().min(2, 'Organization name is required'),
  organizationSlug: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z
    .string()
    .min(3, 'Enter an email')
    .regex(/^[^\s@]+@[^\s@]+$/, 'Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export function RegisterPage() {
  const { register: registerUser, registerLoading, registerError, isAuthenticated, ready } =
    useAuth();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationName: '',
      organizationSlug: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    },
  });

  if (ready && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    await registerUser({
      email: values.email,
      password: values.password,
      organizationName: values.organizationName,
      organizationSlug: values.organizationSlug || undefined,
      firstName: values.firstName || undefined,
      lastName: values.lastName || undefined,
    });
    navigate('/', { replace: true });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            WhatsApp Admin
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Create account
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Register your organization and start messaging.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign up</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <Input
                label="Organization name"
                placeholder="Acme Messaging"
                error={errors.organizationName?.message}
                {...register('organizationName')}
              />
              <Input
                label="Organization slug (optional)"
                placeholder="acme-messaging"
                error={errors.organizationSlug?.message}
                {...register('organizationSlug')}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="First name"
                  placeholder="Jane"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Last name"
                  placeholder="Doe"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>
              <Input
                label="Email"
                type="email"
                autoComplete="username"
                placeholder="ops@acme.com"
                error={errors.email?.message}
                {...register('email')}
              />
              <Input
                label="Password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                error={errors.password?.message}
                {...register('password')}
              />
              {registerError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {registerError}
                </div>
              ) : null}
              <Button type="submit" className="w-full" loading={registerLoading}>
                Create account
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-zinc-950 dark:text-zinc-50 hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
