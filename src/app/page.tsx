import PoTable from "@/components/poTable";
import ShipTable from "@/components/shipTable";


export default function Home() {
  return (
    <div>
      <div>
        <ul>
          <li><button id="poTab" type="button" role="tab" aria-selected="true">발주 엔진</button></li>
          <li><button id="shipTab" type="button" role="tab" aria-selected="false">선적 엔진</button></li>
        </ul>
        <div>
          <div id="tab1" role="tabpanel" aria-labelledby="tab1">
            <PoTable/>
          </div>
          <div id="tab2" role="tabpanel" aria-labelledby="tab2">
            <ShipTable/>
          </div>
        </div>
      </div>
    </div>
  );
}
