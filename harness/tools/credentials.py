"""OS vault only. Run setup in the user's own terminal, never in chat."""
import sys
import getpass
import urllib.request
SERVICE = 'motion-harness2-gemini'
ACCOUNT = 'lyria'

def vault():
    import keyring
    backend = keyring.get_keyring()
    allowed = {'keyring.backends.macOS.Keyring', 'keyring.backends.Windows.WinVaultKeyring', 'keyring.backends.SecretService.Keyring'}
    name = type(backend).__module__ + '.' + type(backend).__name__
    if name not in allowed:
        raise RuntimeError('OS credential vault unavailable')
    return backend

def read_key():
    value = vault().get_password(SERVICE, ACCOUNT)
    if not value:
        raise RuntimeError('Credential not configured')
    return value

def main():
    action = sys.argv[1] if len(sys.argv) == 2 else ''
    try:
        if action == 'setup':
            if not sys.stdin.isatty() or not sys.stdout.isatty():
                print('Run this command in your own interactive terminal. Never paste the key into chat.')
                return 1
            store = vault()
            value = getpass.getpass('Gemini API key (hidden; OS vault): ').strip()
            if not value or any(c.isspace() for c in value):
                print('Invalid key input.'); return 1
            req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models', headers={'x-goog-api-key': value})
            # Do not follow redirects with a credential header.
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs): return None
            with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as res:
                if res.status != 200: raise RuntimeError()
            store.set_password(SERVICE, ACCOUNT, value)
            print('Saved in OS vault; API connection verified. Lyria access/billing checked at generation.')
        elif action == 'status':
            print('Credential configured' if vault().get_password(SERVICE, ACCOUNT) else 'Credential not configured')
        elif action == 'delete':
            vault().delete_password(SERVICE, ACCOUNT)
            print('Credential removed')
        else:
            print('Usage: credentials.py setup|status|delete'); return 1
        return 0
    except Exception:
        print('Credential operation failed. Check Python keyring, an unlocked OS vault and Google API access. No plaintext fallback.')
        return 1
if __name__ == '__main__':
    sys.exit(main())
