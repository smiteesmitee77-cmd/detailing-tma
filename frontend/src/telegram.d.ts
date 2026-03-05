interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramWebAppMainButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  show(): void;
  hide(): void;
  enable(): void;
  disable(): void;
  onClick(fn: () => void): void;
  offClick(fn: () => void): void;
  showProgress(leaveActive?: boolean): void;
  hideProgress(): void;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: TelegramWebAppUser;
    query_id?: string;
    auth_date?: number;
    hash?: string;
  };
  MainButton: TelegramWebAppMainButton;
  ready(): void;
  expand(): void;
  close(): void;
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp;
  };
}
