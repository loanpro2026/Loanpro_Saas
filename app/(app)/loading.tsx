import { PageSkeleton } from '@/components/ui/PageSkeleton'

export default function AppLoading() {
  return (
    <>
      <div className="loading-bar fixed left-0 right-0 top-0 z-[80] h-0.5 bg-primary-500 lg:left-[248px]" aria-hidden />
      <PageSkeleton />
    </>
  )
}
