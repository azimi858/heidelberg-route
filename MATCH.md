# all nodes
MATCH (n:Place) RETURN n

# all routes
MATCH (x)-[r:DRIVE]->(y) RETURN r

# all routes between two nodes
MATCH path = (x)-[r:DRIVE*]-(y) 
    WHERE apoc.coll.duplicates(NODES(path)) = []
    AND x.id = 1 and y.id = 2
RETURN r
