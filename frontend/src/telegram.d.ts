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
  setText(text: string): TelegramWebAppMainButton;
  show(): TelegramWebAppMainButton;
  hide(): TelegramWebAppMainButton;
  enable(): TelegramWebAppMainButton;
  disable(): TelegramWebAppMainButton;
  onClick(fn: () => void): TelegramWebAppMainButton;
  offClick(fn: () => void): TelegramWebAppMainButton;
  showProgress(leaveActive?: boolean): TelegramWebAppMainButton;
  hideProgress(): TelegramWebAppMainButton;
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
