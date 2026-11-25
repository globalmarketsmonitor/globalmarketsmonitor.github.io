// The public site sends no alerts or emails and holds no keys for them.
export const channels = () => ({ telegram: false, email: false });
export async function deliver() { return { skipped: 'the public site sends no alerts' }; }
