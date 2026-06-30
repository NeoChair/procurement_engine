export default function SummaryBoard () {
    return(<div className="w-full px-2 py-4">
        <div className="flex flex-row justify-between">
            <div className="flex flex-col items-start flex-1">
                <span>발주 필요 SKU</span>
                <span className="text-4xl">569</span>
            </div>
            <div className="flex flex-col items-start flex-1">
                <span>총 발주 수량</span>
                <span className="text-4xl">136,363EA</span>
            </div>
            <div className="flex flex-col items-start flex-1">
                <span>정상 SKU수</span>
                <span className="text-4xl">600개</span>
            </div>
        </div>
    </div>)
}