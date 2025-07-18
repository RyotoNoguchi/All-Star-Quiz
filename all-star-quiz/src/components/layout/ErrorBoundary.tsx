'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 bg-white/90 backdrop-blur">
            <Alert className="mb-4 border-red-200 bg-red-50">
              <AlertTitle className="text-red-800">
                🚨 エラーが発生しました
              </AlertTitle>
              <AlertDescription className="text-red-700">
                アプリケーションで予期しないエラーが発生しました。
                ページを再読み込みしてお試しください。
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <Button 
                onClick={() => window.location.reload()}
                className="w-full"
              >
                ページを再読み込み
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => window.history.back()}
                className="w-full"
              >
                前のページに戻る
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 p-3 bg-gray-100 rounded text-xs">
                <summary className="cursor-pointer font-semibold">
                  開発者向け詳細情報
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

// ゲーム専用のErrorBoundary
export const GameErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  const gameErrorFallback = (
    <Card className="p-6 bg-red-50/90 backdrop-blur border-red-200">
      <Alert className="border-red-300">
        <AlertTitle className="text-red-800">
          ゲームエラー
        </AlertTitle>
        <AlertDescription className="text-red-700">
          クイズゲームでエラーが発生しました。ゲームを再開してください。
        </AlertDescription>
      </Alert>
      <Button 
        onClick={() => window.location.reload()}
        className="mt-4 w-full bg-red-600 hover:bg-red-700"
      >
        ゲームを再開
      </Button>
    </Card>
  )

  return (
    <ErrorBoundary fallback={gameErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}