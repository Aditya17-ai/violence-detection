import { useParams } from 'react-router-dom'

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Analysis Results
        </h1>
        <p className="text-gray-600">
          Results for Analysis ID: {id}
        </p>
        <div className="mt-8">
          <p className="text-sm text-gray-500">
            This page will show detailed analysis results...
          </p>
        </div>
      </div>
    </div>
  )
}