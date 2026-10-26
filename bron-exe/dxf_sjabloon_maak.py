import ezdxf, io
from ezdxf.entities.geodata import GeoData
LAGEN = [('PV_AS',1),('PV_DWARSLIJN',30),('PV_STATION_TEKST',30),('PV_DWARS_3D',3),('PV_PROF_MAAIVELD',4),('PV_PROF_MAAIVELD_B',6),('PV_PROF_RASTER',8),('PV_PROF_KADER',7),('PV_PROF_TEKST',7),('PV_PROF_HOOGTE',7),('PV_PROF_AS',1),('PV_PROF_NAP',7),('PV_PROF_WATER',5),('PV_PROF_BGT',1),('PV_PROF_BGT_TEKST',1)]
RD = """<?xml version="1.0" encoding="UTF-16" standalone="no" ?>
<Dictionary version="1.0" xmlns="http://www.osgeo.org/mapguide/coordinatesystem">

<ProjectedCoordinateSystem id="Netherlands-RDNew">
<Name>Netherlands-RDNew</Name>
<AdditionalInformation>
<ParameterItem type="CsMap">
<Key>CSQuadrantSimplified</Key>
<IntegerValue>1</IntegerValue>
</ParameterItem>
</AdditionalInformation>
<DomainOfValidity>
<Extent>
<GeographicElement>
<GeographicBoundingBox>
<WestBoundLongitude>3.2</WestBoundLongitude>
<EastBoundLongitude>7.22</EastBoundLongitude>
<SouthBoundLatitude>50.75</SouthBoundLatitude>
<NorthBoundLatitude>53.7</NorthBoundLatitude>
</GeographicBoundingBox>
</GeographicElement>
</Extent>
</DomainOfValidity>
<DatumId>Amersfoort</DatumId>
<Axis uom="Meter">
<CoordinateSystemAxis>
<AxisOrder>1</AxisOrder>
<AxisName>Easting</AxisName>
<AxisAbbreviation>E</AxisAbbreviation>
<AxisDirection>East</AxisDirection>
</CoordinateSystemAxis>
<CoordinateSystemAxis>
<AxisOrder>2</AxisOrder>
<AxisName>Northing</AxisName>
<AxisAbbreviation>N</AxisAbbreviation>
<AxisDirection>North</AxisDirection>
</CoordinateSystemAxis>
</Axis>
<Conversion>
<Projection>
<OperationMethodId>Oblique Stereographic</OperationMethodId>
<ParameterValue><OperationParameterId>Latitude of natural origin</OperationParameterId><Value uom="degree">52.1561605555556</Value></ParameterValue>
<ParameterValue><OperationParameterId>Longitude of natural origin</OperationParameterId><Value uom="degree">5.38763888888889</Value></ParameterValue>
<ParameterValue><OperationParameterId>Scale factor at natural origin</OperationParameterId><Value uom="unity">0.9999079</Value></ParameterValue>
<ParameterValue><OperationParameterId>False easting</OperationParameterId><Value uom="Meter">155000</Value></ParameterValue>
<ParameterValue><OperationParameterId>False northing</OperationParameterId><Value uom="Meter">463000</Value></ParameterValue>
</Projection>
</Conversion>
</ProjectedCoordinateSystem>
<Alias id="28992" type="CoordinateSystem">
<ObjectId>Netherlands-RDNew</ObjectId>
<Namespace>EPSG Code</Namespace>
</Alias>

<GeodeticDatum id="Amersfoort">
<Name>Amersfoort</Name>
<PrimeMeridianId>Greenwich</PrimeMeridianId>
<EllipsoidId>BESSEL</EllipsoidId>
</GeodeticDatum>
<Alias id="6289" type="Datum">
<ObjectId>Amersfoort</ObjectId>
<Namespace>EPSG Code</Namespace>
</Alias>

<Ellipsoid id="BESSEL">
<Name>BESSEL</Name>
<SemiMajorAxis uom="meter">6377397.155</SemiMajorAxis>
<SecondDefiningParameter>
<SemiMinorAxis uom="meter">6356078.96281819</SemiMinorAxis>
</SecondDefiningParameter>
</Ellipsoid>
<Alias id="7004" type="Ellipsoid">
<ObjectId>BESSEL</ObjectId>
<Namespace>EPSG Code</Namespace>
</Alias>


</Dictionary>
"""
doc = ezdxf.new('R2010', setup=False, units=6)
h = doc.header
h['$MEASUREMENT'] = 1; h['$LUNITS'] = 2; h['$LUPREC'] = 3; h['$INSUNITS'] = 6; h['$AUNITS'] = 0; h['$AUPREC'] = 4
h['$DWGCODEPAGE'] = 'ANSI_1252'
for n, k in LAGEN: doc.layers.add(n, color=k)
doc.styles.get('Standard').dxf.font = 'arial.ttf'
msp = doc.modelspace()
geo = msp.new_geodata()
geo.setup_local_grid(design_point=(155000, 463000), reference_point=(155000, 463000), crs=RD)
geo.dxf.coordinate_type = 2   # projected grid: tekening = RD-coördinaten
geo.dxf.block_record_handle = msp.layout_key
s = io.StringIO(); doc.write(s); t = s.getvalue()
open('sjabloon.dxf','w',encoding='utf-8').write(t)
print(len(t), h['$HANDSEED'], msp.layout_key)
# voorbeeld-entiteiten om het formaat te zien
d2 = ezdxf.new('R2010', setup=False, units=6); m2 = d2.modelspace()
m2.add_line((0,0,0),(1,1,0),dxfattribs={'layer':'0'})
m2.add_lwpolyline([(0,0),(1,0),(1,1)], dxfattribs={'layer':'0'})
m2.add_polyline3d([(0,0,0),(1,0,1)], dxfattribs={'layer':'0'})
tx = m2.add_text('Ab', dxfattribs={'layer':'0','height':0.25,'rotation':90}); tx.set_placement((1,2), align=ezdxf.enums.TextEntityAlignment.MIDDLE_RIGHT)
s2 = io.StringIO(); d2.write(s2); t2 = s2.getvalue()
i = t2.index('ENTITIES'); j = t2.index('ENDSEC', i); print(t2[i:j])
