import { useParams } from 'react-router-dom'

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Analysis in Progress
        </h1>
        <p className="text-gray-600">
          Analysis ID: {id}
        </p>
        <div className="mt-8">
          <div className="spinner w-8 h-8 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-500">
            This page will show real-time analysis progress...
          </p>
        </div>
      </div>
    </div>
  )
}