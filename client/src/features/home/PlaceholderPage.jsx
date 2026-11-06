// PlaceholderPage.jsx: Phase 0 placeholder. Shows the app name and whether the API answers
// through the Vite /api proxy, so running `npm run dev` in both apps can be checked at a glance.
import { Badge, Container, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import classes from './PlaceholderPage.module.css';

const APP_NAME = import.meta.env.VITE_APP_NAME || 'ScreenGuide';

async function fetchHealth() {
  const res = await fetch('/api/health', { credentials: 'include' });
  if (!res.ok) throw new Error(`Health check failed (${res.status})`);
  return res.json();
}

export function PlaceholderPage() {
  // ----- Data -----
  const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth });

  // ----- Render -----
  let badge = (
    <Badge color="gray" variant="light">
      Checking API…
    </Badge>
  );
  if (health.isSuccess) {
    badge = (
      <Badge color="teal" variant="light">
        API connected
      </Badge>
    );
  } else if (health.isError) {
    badge = (
      <Badge color="red" variant="light">
        API not reachable
      </Badge>
    );
  }

  return (
    <Container size="sm" className={classes.page}>
      <Stack gap="md">
        <Title order={1}>{APP_NAME} AI</Title>
        <Text c="dimmed">
          Tech help that sees your screen and talks you through it. Setup is in progress.
        </Text>
        <Group gap="xs" aria-live="polite">
          <Text size="sm">Server status:</Text>
          {badge}
        </Group>
      </Stack>
    </Container>
  );
}
