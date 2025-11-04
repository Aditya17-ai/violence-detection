import { Link } from 'react-router-dom'
import { 
  CloudArrowUpIcon, 
  EyeIcon, 
  ShieldCheckIcon,
  ChartBarIcon,
  ClockIcon,
  CpuChipIcon
} from '@heroicons/react/24/outline'

const features = [
  {
    name: 'AI-Powered Detection',
    description: 'Advanced machine learning models trained to identify violent content with high accuracy.',
    icon: CpuChipIcon,
  },
  {
    name: 'Real-time Analysis',
    description: 'Get instant feedback and progress updates as your videos are being analyzed.',
    icon: EyeIcon,
  },
  {
    name: 'Secure Processing',
    description: 'Your videos are processed securely and deleted after analysis completion.',
    icon: ShieldCheckIcon,
  },
  {
    name: 'Detailed Reports',
    description: 'Comprehensive analysis reports with timestamps and confidence scores.',
    icon: ChartBarIcon,
  },
]

const stats = [
  { name: 'Videos Analyzed', value: '10,000+' },
  { name: 'Accuracy Rate', value: '95.2%' },
  { name: 'Processing Speed', value: '2x Real-time' },
  { name: 'Supported Formats', value: '4+' },
]

export default function HomePage() {
  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">
          AI Violence Detection
          <span className="block text-primary-600">Made Simple</span>
        </h1>
        <p className="mt-6 text-lg leading-8 text-gray-600 max-w-2xl mx-auto">
          Upload your videos and get instant analysis for violent content using state-of-the-art 
          artificial intelligence. Fast, accurate, and secure.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-6">
          <Link to="/upload" className="btn-primary text-lg px-8 py-3">
            <CloudArrowUpIcon className="w-5 h-5 mr-2" />
            Upload Video
          </Link>
          <Link to="/history" className="btn-secondary text-lg px-8 py-3">
            <ClockIcon className="w-5 h-5 mr-2" />
            View History
          </Link>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-16 text-center lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.name} className="mx-auto flex max-w-xs flex-col gap-y-4">
                <dt className="text-base leading-7 text-gray-600">{stat.name}</dt>
                <dd className="order-first text-3xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary-600">
              Advanced Technology
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need for video content analysis
            </p>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Our platform combines cutting-edge AI technology with an intuitive interface 
              to provide comprehensive violence detection capabilities.
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-16 lg:max-w-none lg:grid-cols-2">
              {features.map((feature) => (
                <div key={feature.name} className="flex flex-col">
                  <dt className="flex items-center gap-x-3 text-base font-semibold leading-7 text-gray-900">
                    <feature.icon className="h-5 w-5 flex-none text-primary-600" aria-hidden="true" />
                    {feature.name}
                  </dt>
                  <dd className="mt-4 flex flex-auto flex-col text-base leading-7 text-gray-600">
                    <p className="flex-auto">{feature.description}</p>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* How it Works Section */}
      <div className="bg-gray-50 py-12 sm:py-16 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary-600">
              Simple Process
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              How it works
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-none">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                  <CloudArrowUpIcon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">1. Upload Video</h3>
                <p className="text-gray-600">
                  Upload your video file in MP4, AVI, MOV, or MKV format. Files up to 500MB are supported.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                  <CpuChipIcon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">2. AI Analysis</h3>
                <p className="text-gray-600">
                  Our AI model analyzes each frame of your video to detect potential violent content.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
                  <ChartBarIcon className="w-8 h-8 text-primary-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">3. Get Results</h3>
                <p className="text-gray-600">
                  Receive detailed analysis results with timestamps, confidence scores, and visual markers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-primary-600 py-12 sm:py-16 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to analyze your videos?
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-primary-100">
            Start using our AI-powered violence detection system today. 
            Upload your first video and see the results in minutes.
          </p>
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link 
              to="/upload" 
              className="rounded-md bg-white px-8 py-3 text-lg font-semibold text-primary-600 shadow-sm hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}