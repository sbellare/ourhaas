import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { SiteLayout, Lamp } from '@/components/site-layout';
import Home from '@/pages/home';
import Events from '@/pages/events';
import { About, Contact, Membership } from '@/pages/info';
import { ResourcePage, Resources } from '@/pages/resources';
import Admin from '@/pages/admin';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(4 72% 44%)',
    colorForeground: 'hsl(200 45% 13%)',
    colorMutedForeground: 'hsl(200 18% 36%)',
    colorDanger: 'hsl(356 70% 42%)',
    colorBackground: 'hsl(40 60% 98%)',
    colorInput: 'hsl(38 52% 95%)',
    colorInputForeground: 'hsl(200 45% 13%)',
    colorNeutral: 'hsl(200 45% 13%)',
    fontFamily: "'Outfit', sans-serif",
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(40_60%_98%)] rounded-[1.75rem] w-[440px] max-w-full overflow-hidden border border-[hsl(32_30%_84%)] shadow-[0_30px_60px_-40px_hsl(190_48%_22%/.6)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: "text-[hsl(200_45%_13%)] font-['Fraunces'] text-2xl font-semibold",
    headerSubtitle: 'text-[hsl(200_18%_36%)]',
    socialButtonsBlockButtonText: 'text-[hsl(200_45%_13%)] font-medium',
    formFieldLabel: 'text-[hsl(200_45%_13%)] font-medium',
    footerActionLink: 'text-[hsl(4_72%_44%)] font-semibold hover:text-[hsl(190_48%_22%)]',
    footerActionText: 'text-[hsl(200_18%_36%)]',
    dividerText: 'text-[hsl(200_18%_36%)]',
    identityPreviewEditButton: 'text-[hsl(4_72%_44%)]',
    formFieldSuccessText: 'text-[hsl(140_32%_30%)]',
    alertText: 'text-[hsl(200_45%_13%)]',
    logoBox: 'h-14 justify-center',
    logoImage: 'h-14 w-14',
    socialButtonsBlockButton: 'border border-[hsl(32_28%_78%)] bg-[hsl(38_52%_95%)] rounded-full',
    formButtonPrimary: 'bg-[hsl(4_72%_44%)] text-[hsl(40_60%_97%)] rounded-full font-semibold',
    formFieldInput: 'bg-[hsl(38_52%_95%)] border border-[hsl(32_28%_78%)] text-[hsl(200_45%_13%)] rounded-xl',
    footerAction: 'justify-center',
    dividerLine: 'bg-[hsl(32_30%_82%)]',
    alert: 'bg-[hsl(41_88%_54%/.15)] border border-[hsl(41_88%_54%/.4)]',
    otpCodeFieldInput: 'border border-[hsl(32_28%_78%)] text-[hsl(200_45%_13%)]',
    formFieldRow: 'gap-3',
    main: 'gap-5',
  },
};

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="rangoli-bg flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <Lamp className="h-10 w-10" />
        <p className="font-display text-xl font-semibold">Our HAAS</p>
      </div>
      {children}
      <p className="max-w-sm text-center text-xs text-muted-foreground">Event editing is limited to the assigned, verified HAAS admin email.</p>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthShell>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} fallbackRedirectUrl={`${basePath}/admin`} />
    </AuthShell>
  );
}

function SignUpPage() {
  return (
    <AuthShell>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} fallbackRedirectUrl={`${basePath}/admin`} />
    </AuthShell>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function SiteRoutes() {
  return (
    <SiteLayout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/events" component={Events} />
          <Route path="/membership" component={Membership} />
          <Route path="/about" component={About} />
          <Route path="/resources" component={Resources} />
          <Route path="/resources/:slug" component={ResourcePage} />
          <Route path="/contact" component={Contact} />
          <Route path="/admin" component={Admin} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </SiteLayout>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back to Our HAAS', subtitle: 'Committee sign in for event management' } },
        signUp: { start: { title: 'Create your HAAS account', subtitle: 'Use the assigned HAAS admin email to manage events' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route component={SiteRoutes} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
